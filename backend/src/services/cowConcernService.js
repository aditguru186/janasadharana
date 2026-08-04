'use strict';

const { query, withTransaction } = require('../db/pool');
const { AppError, assertFound } = require('../utils/errors');
const {
  validateCoordinates,
  assertInsidePuriGeofence
} = require('../utils/geo');
const { generateTrackingCode } = require('../utils/tracking');
const { uploadCowConcernMedia } = require('../utils/r2');
const { ROLES } = require('../utils/constants');

const CONCERN_TYPES = [
  'injured',
  'unwell',
  'stranded',
  'hit_by_vehicle',
  'malnourished',
  'other'
];

const CONCERN_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'rejected'];

const STATUS_TRANSITIONS = {
  open: ['assigned', 'in_progress', 'rejected'],
  assigned: ['in_progress', 'open', 'rejected'],
  in_progress: ['resolved', 'assigned', 'rejected'],
  resolved: [],
  rejected: ['open']
};

function mapConcern(row) {
  if (!row) return null;
  return {
    id: row.id,
    trackingCode: row.tracking_code,
    concernText: row.concern_text,
    concernType: row.concern_type,
    voiceId: row.voice_id || null,
    images: row.images || [],
    pdfs: row.pdfs || [],
    status: row.status,
    assignedTo: row.assigned_to
      ? {
          id: row.assigned_to,
          fullName: row.agent_name || null,
          phone: row.agent_phone || null
        }
      : null,
    reporterName: row.reporter_name,
    reporterPhone: row.reporter_phone,
    landmark: row.landmark,
    location:
      row.lng != null && row.lat != null
        ? { type: 'Point', coordinates: [Number(row.lng), Number(row.lat)] }
        : null,
    date: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAgent(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    areaCoverage: row.area_coverage,
    isAvailable: row.is_available,
    isActive: row.is_active,
    notes: row.notes,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Public create — concern text (or voice) first, optional images, contact + GPS.
 */
async function createConcern(payload) {
  const {
    concernText,
    concernType = 'injured',
    reporterName,
    reporterPhone,
    location,
    landmark,
    voiceBase64,
    imagesBase64,
    imageBase64,
    pdfsBase64
  } = payload;

  const text = String(concernText || '').trim();
  const hasVoice = Boolean(voiceBase64);
  if (text.length < 3 && !hasVoice) {
    throw new AppError(400, 'Enter the concern as text or record a voice note.');
  }
  if (!CONCERN_TYPES.includes(concernType)) {
    throw new AppError(400, 'Invalid concern_type.');
  }

  let lat = null;
  let lng = null;
  if (location?.coordinates?.length === 2) {
    [lng, lat] = location.coordinates.map(Number);
    validateCoordinates(lat, lng);
    assertInsidePuriGeofence(lat, lng);
  }

  const imagesInput = Array.isArray(imagesBase64)
    ? imagesBase64
    : imageBase64
      ? [imageBase64]
      : [];

  const media = await uploadCowConcernMedia({
    voiceBase64,
    imagesBase64: imagesInput,
    pdfsBase64: Array.isArray(pdfsBase64) ? pdfsBase64 : []
  });

  const trackingCode = generateTrackingCode();
  const finalText =
    text ||
    (hasVoice
      ? '[Voice note attached — see voice_id]'
      : 'Cow welfare concern');

  const { rows } = await query(
    `INSERT INTO cow_concerns (
       tracking_code, concern_text, concern_type, voice_id, images, pdfs,
       status, reporter_name, reporter_phone, location, landmark
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb,
       'open', $7, $8,
       CASE WHEN $9::float8 IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint($10, $9), 4326)::geography END,
       $11
     )
     RETURNING id`,
    [
      trackingCode,
      finalText,
      concernType,
      media.voice_id ? JSON.stringify(media.voice_id) : null,
      JSON.stringify(media.images || []),
      JSON.stringify(media.pdfs || []),
      reporterName ? String(reporterName).trim().slice(0, 120) : null,
      reporterPhone ? String(reporterPhone).replace(/\D/g, '').slice(0, 15) : null,
      lat,
      lng,
      landmark ? String(landmark).trim().slice(0, 500) : null
    ]
  );

  await query(
    `INSERT INTO cow_concern_status_history (concern_id, from_status, to_status, note)
     VALUES ($1, NULL, 'open', 'Public concern raised')`,
    [rows[0].id]
  );

  return getById(rows[0].id);
}

async function getById(id) {
  const { rows } = await query(
    `SELECT c.*,
            ST_Y(c.location::geometry) AS lat,
            ST_X(c.location::geometry) AS lng,
            a.full_name AS agent_name,
            a.phone AS agent_phone
     FROM cow_concerns c
     LEFT JOIN ground_agents a ON a.id = c.assigned_to
     WHERE c.id = $1`,
    [id]
  );
  return mapConcern(assertFound(rows[0], 'Concern not found.'));
}

async function getByTrackingCode(code) {
  const { rows } = await query(
    `SELECT c.*,
            ST_Y(c.location::geometry) AS lat,
            ST_X(c.location::geometry) AS lng,
            a.full_name AS agent_name,
            a.phone AS agent_phone
     FROM cow_concerns c
     LEFT JOIN ground_agents a ON a.id = c.assigned_to
     WHERE c.tracking_code = $1`,
    [String(code).toUpperCase()]
  );
  const mapped = mapConcern(assertFound(rows[0], 'No concern found for this tracking code.'));
  // Public track: hide reporter phone
  if (mapped) mapped.reporterPhone = undefined;
  return mapped;
}

async function listConcerns(filters = {}) {
  const { status, concernType, page = 1, limit = 20, assignedTo, q } = filters;
  const where = [];
  const params = [];
  let i = 1;

  if (status) {
    if (!CONCERN_STATUSES.includes(status)) throw new AppError(400, 'Invalid status.');
    where.push(`c.status = $${i++}`);
    params.push(status);
  }
  if (concernType) {
    if (!CONCERN_TYPES.includes(concernType)) throw new AppError(400, 'Invalid concern_type.');
    where.push(`c.concern_type = $${i++}`);
    params.push(concernType);
  }
  if (assignedTo) {
    where.push(`c.assigned_to = $${i++}`);
    params.push(assignedTo);
  }
  if (q) {
    where.push(
      `(c.concern_text ILIKE $${i} OR c.tracking_code ILIKE $${i} OR c.reporter_name ILIKE $${i})`
    );
    params.push(`%${q}%`);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * limit;

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM cow_concerns c ${whereSql}`,
    params
  );

  const listParams = [...params, limit, offset];
  const { rows } = await query(
    `SELECT c.*,
            ST_Y(c.location::geometry) AS lat,
            ST_X(c.location::geometry) AS lng,
            a.full_name AS agent_name,
            a.phone AS agent_phone
     FROM cow_concerns c
     LEFT JOIN ground_agents a ON a.id = c.assigned_to
     ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams
  );

  return {
    data: rows.map(mapConcern),
    meta: {
      total: countRes.rows[0].total,
      page: Math.max(1, page),
      limit,
      totalPages: Math.max(1, Math.ceil(countRes.rows[0].total / limit))
    }
  };
}

async function updateStatus(id, newStatus, user, note) {
  if (!CONCERN_STATUSES.includes(newStatus)) {
    throw new AppError(400, 'Invalid status.');
  }
  if (user.role === ROLES.CITIZEN) {
    throw new AppError(403, 'Not allowed to change concern status.');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM cow_concerns WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const c = assertFound(rows[0], 'Concern not found.');
    const allowed = STATUS_TRANSITIONS[c.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new AppError(422, `Cannot transition from "${c.status}" to "${newStatus}".`, {
        allowedTransitions: allowed
      });
    }
    await client.query(`UPDATE cow_concerns SET status = $1 WHERE id = $2`, [
      newStatus,
      id
    ]);
    await client.query(
      `INSERT INTO cow_concern_status_history (concern_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, c.status, newStatus, user.id, note || null]
    );
  }).then(() => getById(id));
}

async function assignConcern(id, agentId, user) {
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.OFFICER) {
    throw new AppError(403, 'Not allowed to assign concerns.');
  }

  const agent = await query(
    `SELECT id FROM ground_agents WHERE id = $1 AND is_active`,
    [agentId]
  );
  if (!agent.rows[0]) throw new AppError(400, 'Agent not found or inactive.');

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM cow_concerns WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const c = assertFound(rows[0], 'Concern not found.');
    let status = c.status;
    if (status === 'open') status = 'assigned';

    await client.query(
      `UPDATE cow_concerns SET assigned_to = $1, status = $2 WHERE id = $3`,
      [agentId, status, id]
    );

    if (status !== c.status) {
      await client.query(
        `INSERT INTO cow_concern_status_history (concern_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, c.status, status, user.id, 'Assigned to ground agent']
      );
    }
  }).then(() => getById(id));
}

async function getHistory(id) {
  await getById(id);
  const { rows } = await query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            u.full_name AS changed_by_name
     FROM cow_concern_status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.concern_id = $1
     ORDER BY h.created_at ASC`,
    [id]
  );
  return rows.map((r) => ({
    id: r.id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    note: r.note,
    changedByName: r.changed_by_name,
    createdAt: r.created_at
  }));
}

/* ─── Ground agents ───────────────────────────────────────────── */

async function listAgents({ availableOnly = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM ground_agents
     WHERE is_active = TRUE
     ${availableOnly ? 'AND is_available = TRUE' : ''}
     ORDER BY full_name`
  );
  return rows.map(mapAgent);
}

async function createAgent(payload) {
  const { fullName, phone, email, areaCoverage, notes, isAvailable } = payload;
  if (!fullName || String(fullName).trim().length < 2) {
    throw new AppError(400, 'Agent name is required.');
  }
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length !== 10) {
    throw new AppError(400, 'Agent phone must be 10 digits.');
  }

  try {
    const { rows } = await query(
      `INSERT INTO ground_agents (full_name, phone, email, area_coverage, notes, is_available)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        String(fullName).trim(),
        digits,
        email || null,
        areaCoverage || 'Puri 20km',
        notes || null,
        isAvailable !== false
      ]
    );
    return mapAgent(rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'Agent with this phone already exists.');
    throw err;
  }
}

async function updateAgent(id, payload) {
  const existing = await query(`SELECT * FROM ground_agents WHERE id = $1`, [id]);
  assertFound(existing.rows[0], 'Agent not found.');

  const fullName = payload.fullName ?? existing.rows[0].full_name;
  const email = payload.email !== undefined ? payload.email : existing.rows[0].email;
  const areaCoverage = payload.areaCoverage ?? existing.rows[0].area_coverage;
  const notes = payload.notes !== undefined ? payload.notes : existing.rows[0].notes;
  const isAvailable =
    payload.isAvailable !== undefined ? payload.isAvailable : existing.rows[0].is_available;
  const isActive =
    payload.isActive !== undefined ? payload.isActive : existing.rows[0].is_active;

  const { rows } = await query(
    `UPDATE ground_agents
     SET full_name = $1, email = $2, area_coverage = $3, notes = $4,
         is_available = $5, is_active = $6
     WHERE id = $7
     RETURNING *`,
    [fullName, email, areaCoverage, notes, isAvailable, isActive, id]
  );
  return mapAgent(rows[0]);
}

module.exports = {
  CONCERN_TYPES,
  CONCERN_STATUSES,
  createConcern,
  getById,
  getByTrackingCode,
  listConcerns,
  updateStatus,
  assignConcern,
  getHistory,
  listAgents,
  createAgent,
  updateAgent,
  mapConcern,
  mapAgent
};
