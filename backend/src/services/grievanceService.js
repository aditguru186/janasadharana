'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');
const { query, withTransaction } = require('../db/pool');
const { AppError, assertFound } = require('../utils/errors');
const {
  CATEGORIES,
  STATUSES,
  STATUS_TRANSITIONS,
  ROLES
} = require('../utils/constants');
const {
  validateCoordinates,
  assertInsidePuriGeofence
} = require('../utils/geo');
const { generateTrackingCode } = require('../utils/tracking');
const { saveCowWelfareMedia } = require('../utils/media');
const { isR2Configured, uploadCowConcernMedia } = require('../utils/r2');

const SELECT_FIELDS = `
  g.id,
  g.tracking_code,
  g.title,
  g.description,
  g.category,
  g.status,
  g.upvote_count,
  g.extra_details,
  g.media,
  g.source,
  g.ward_id,
  g.citizen_id,
  g.assignee_id,
  g.resolved_at,
  g.created_at,
  g.updated_at,
  ST_Y(g.location::geometry) AS lat,
  ST_X(g.location::geometry) AS lng,
  w.code AS ward_code,
  w.name AS ward_name,
  c.full_name AS citizen_name,
  c.phone AS citizen_phone,
  a.full_name AS assignee_name
`;

function mapGrievance(row, { includeCitizenContact = false, includeMedia = true } = {}) {
  if (!row) return null;
  const media = Array.isArray(row.media) ? row.media : [];
  const base = {
    id: row.id,
    trackingCode: row.tracking_code,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    source: row.source || 'web',
    upvoteCount: row.upvote_count,
    extraDetails: row.extra_details || [],
    media: includeMedia
      ? media.map((m) => ({
          ...m,
          // Prefer public R2 URL when present
          path: m.url || m.path
        }))
      : media.map((m) => ({ type: m.type, mime: m.mime, path: m.url || m.path })),
    location: {
      type: 'Point',
      coordinates: [Number(row.lng), Number(row.lat)]
    },
    ward: row.ward_id
      ? { id: row.ward_id, code: row.ward_code, name: row.ward_name }
      : null,
    citizenId: row.citizen_id,
    citizenName: row.citizen_name,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasUpvoted: row.has_upvoted === true || row.has_upvoted === true
  };
  if (includeCitizenContact) {
    base.citizenPhone = row.citizen_phone;
  }
  if (row.has_upvoted !== undefined) {
    base.hasUpvoted = Boolean(row.has_upvoted);
  }
  return base;
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  throw new AppError(400, 'Phone must be a valid 10-digit Indian mobile number.');
}

/**
 * Find or create a citizen account for anonymous cow-welfare reporters.
 * New accounts get a random unusable password (they can still register later separately).
 */
async function findOrCreateReporter({ phone, fullName }) {
  const normalized = normalizePhone(phone);
  const name = String(fullName || '').trim();
  if (name.length < 2) {
    throw new AppError(400, 'Name must be at least 2 characters.');
  }

  const existing = await query(
    `SELECT id, phone, full_name, role, is_active FROM users WHERE phone = $1`,
    [normalized]
  );
  if (existing.rows[0]) {
    if (!existing.rows[0].is_active) {
      throw new AppError(403, 'This phone number is blocked from reporting.');
    }
    // Refresh display name if the stored name looks like a placeholder
    if (name && existing.rows[0].full_name !== name) {
      await query(`UPDATE users SET full_name = $1 WHERE id = $2 AND role = 'citizen'`, [
        name,
        existing.rows[0].id
      ]);
    }
    return existing.rows[0];
  }

  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), config.bcryptRounds);
  const { rows } = await query(
    `INSERT INTO users (phone, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, phone, full_name, role, is_active`,
    [normalized, passwordHash, name, ROLES.CITIZEN]
  );

  await query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, meta)
     VALUES ($1, 'user.cow_welfare_reporter', 'user', $1, $2)`,
    [rows[0].id, JSON.stringify({ phone: normalized, source: 'cow_welfare' })]
  );

  return rows[0];
}

async function listGrievances(filters, user) {
  const {
    category,
    status,
    wardId,
    page = 1,
    limit = 20,
    q,
    mine,
    assigneeId
  } = filters;

  const where = [];
  const params = [];
  let i = 1;

  if (category) {
    if (!CATEGORIES.includes(category)) throw new AppError(400, 'Invalid category.');
    where.push(`g.category = $${i++}`);
    params.push(category);
  }
  if (status) {
    if (!STATUSES.includes(status)) throw new AppError(400, 'Invalid status.');
    where.push(`g.status = $${i++}`);
    params.push(status);
  }
  if (wardId) {
    where.push(`g.ward_id = $${i++}`);
    params.push(wardId);
  }
  if (mine && user) {
    where.push(`g.citizen_id = $${i++}`);
    params.push(user.id);
  }
  if (assigneeId) {
    where.push(`g.assignee_id = $${i++}`);
    params.push(assigneeId);
  }
  if (q) {
    where.push(`(g.title ILIKE $${i} OR g.description ILIKE $${i} OR g.tracking_code ILIKE $${i})`);
    params.push(`%${q}%`);
    i++;
  }

  // Citizens browsing public board: only non-rejected, no PII
  const isStaff = user && (user.role === ROLES.OFFICER || user.role === ROLES.ADMIN);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM grievances g ${whereSql}`,
    params
  );
  const total = countRes.rows[0].total;

  const upvoteSelect = user
    ? `, EXISTS(SELECT 1 FROM grievance_upvotes u WHERE u.grievance_id = g.id AND u.user_id = $${i}) AS has_upvoted`
    : ', FALSE AS has_upvoted';
  if (user) params.push(user.id);

  const listParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const { rows } = await query(
    `SELECT ${SELECT_FIELDS}${upvoteSelect}
     FROM grievances g
     LEFT JOIN wards w ON w.id = g.ward_id
     LEFT JOIN users c ON c.id = g.citizen_id
     LEFT JOIN users a ON a.id = g.assignee_id
     ${whereSql}
     ORDER BY g.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  return {
    data: rows.map((r) => mapGrievance(r, { includeCitizenContact: isStaff })),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

async function getById(id, user) {
  const params = [id];
  let upvoteSelect = ', FALSE AS has_upvoted';
  if (user) {
    upvoteSelect = ', EXISTS(SELECT 1 FROM grievance_upvotes u WHERE u.grievance_id = g.id AND u.user_id = $2) AS has_upvoted';
    params.push(user.id);
  }

  const { rows } = await query(
    `SELECT ${SELECT_FIELDS}${upvoteSelect}
     FROM grievances g
     LEFT JOIN wards w ON w.id = g.ward_id
     LEFT JOIN users c ON c.id = g.citizen_id
     LEFT JOIN users a ON a.id = g.assignee_id
     WHERE g.id = $1`,
    params
  );
  const row = assertFound(rows[0], 'Grievance not found.');
  const isStaff = user && (user.role === ROLES.OFFICER || user.role === ROLES.ADMIN);
  const isOwner = user && user.id === row.citizen_id;
  return mapGrievance(row, { includeCitizenContact: isStaff || isOwner });
}

async function getByTrackingCode(code) {
  const { rows } = await query(
    `SELECT ${SELECT_FIELDS}, FALSE AS has_upvoted
     FROM grievances g
     LEFT JOIN wards w ON w.id = g.ward_id
     LEFT JOIN users c ON c.id = g.citizen_id
     LEFT JOIN users a ON a.id = g.assignee_id
     WHERE g.tracking_code = $1`,
    [code.toUpperCase()]
  );
  const row = assertFound(rows[0], 'No grievance found for this tracking code.');
  // Public track: hide citizen phone
  return mapGrievance(row, { includeCitizenContact: false });
}

async function createGrievance(payload, user) {
  const { title, description, category, location, wardId, extraDetails } = payload;

  if (!title || title.trim().length < 3) {
    throw new AppError(400, 'Title must be at least 3 characters.');
  }
  if (!description || description.trim().length < 10) {
    throw new AppError(400, 'Description must be at least 10 characters.');
  }
  if (!CATEGORIES.includes(category)) {
    throw new AppError(400, 'Invalid category.');
  }
  if (!location?.coordinates || location.coordinates.length !== 2) {
    throw new AppError(400, 'location.coordinates must be [lng, lat].');
  }

  const [lng, lat] = location.coordinates.map(Number);
  validateCoordinates(lat, lng);
  assertInsidePuriGeofence(lat, lng);

  if (wardId) {
    const w = await query(`SELECT id FROM wards WHERE id = $1 AND is_active`, [wardId]);
    if (!w.rows[0]) throw new AppError(400, 'Invalid ward.');
  }

  const trackingCode = generateTrackingCode();
  const details = Array.isArray(extraDetails) ? extraDetails : [];

  const { rows } = await query(
    `INSERT INTO grievances (
       tracking_code, title, description, category, location, ward_id,
       citizen_id, extra_details, source
     ) VALUES (
       $1, $2, $3, $4,
       ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
       $7, $8, $9::jsonb, $10
     )
     RETURNING id`,
    [
      trackingCode,
      title.trim(),
      description.trim(),
      category,
      lng,
      lat,
      wardId || null,
      user.id,
      JSON.stringify(details),
      'web'
    ]
  );

  await query(
    `INSERT INTO status_history (grievance_id, from_status, to_status, changed_by, note)
     VALUES ($1, NULL, 'open', $2, 'Created')`,
    [rows[0].id, user.id]
  );

  await query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, meta)
     VALUES ($1, 'grievance.create', 'grievance', $2, $3)`,
    [user.id, rows[0].id, JSON.stringify({ trackingCode, category })]
  );

  return getById(rows[0].id, user);
}

/**
 * Store cow-welfare evidence on R2 when configured; otherwise local uploads/.
 * Returns media[] shape used in grievances.media JSON.
 */
async function buildCowWelfareMedia({ imageBase64, voiceBase64 }) {
  if (!imageBase64 && !voiceBase64) return [];

  if (!isR2Configured()) {
    return saveCowWelfareMedia({ imageBase64, voiceBase64 });
  }

  const uploaded = await uploadCowConcernMedia({
    voiceBase64: voiceBase64 || null,
    imagesBase64: imageBase64 ? [imageBase64] : [],
    pdfsBase64: []
  });

  const media = [];
  for (const img of uploaded.images || []) {
    media.push({
      type: 'image',
      mime: img.mime,
      filename: img.filename,
      path: img.url || img.key,
      url: img.url || null,
      key: img.key,
      bucket: img.bucket,
      sizeBytes: img.sizeBytes,
      storage: uploaded.storage
    });
  }
  if (uploaded.voice_id) {
    const v = uploaded.voice_id;
    media.push({
      type: 'voice',
      mime: v.mime,
      filename: v.filename,
      path: v.url || v.key,
      url: v.url || null,
      key: v.key,
      bucket: v.bucket,
      sizeBytes: v.sizeBytes,
      storage: uploaded.storage
    });
  }
  return media;
}

/**
 * Public cow-welfare report (no login). Name + phone + GPS required.
 * Optional text/image/voice evidence for ground staff.
 */
async function createCowWelfareReport(payload) {
  const {
    reporterName,
    reporterPhone,
    description,
    location,
    title,
    animalType,
    condition,
    landmark,
    imageBase64,
    voiceBase64
  } = payload;

  if (!location?.coordinates || location.coordinates.length !== 2) {
    throw new AppError(400, 'GPS location is required. coordinates must be [lng, lat].');
  }

  const [lng, lat] = location.coordinates.map(Number);
  validateCoordinates(lat, lng);
  assertInsidePuriGeofence(lat, lng);

  const reporter = await findOrCreateReporter({
    phone: reporterPhone,
    fullName: reporterName
  });

  const desc = String(description || '').trim();
  if (desc.length < 5) {
    throw new AppError(400, 'Please describe the concern (at least 5 characters).');
  }

  const animal = String(animalType || 'cow').trim().toLowerCase();
  const cond = String(condition || 'injured_or_unwell').trim();
  const shortTitle =
    (title && String(title).trim()) ||
    `Cow welfare: ${animal} — ${cond}`.slice(0, 200);

  // Prefer Cloudflare R2 (cow-welfare-puri bucket); local disk only if R2 not configured
  const media = await buildCowWelfareMedia({ imageBase64, voiceBase64 });

  const extraDetails = [
    { key: 'animalType', value: animal },
    { key: 'condition', value: cond },
    { key: 'reporterName', value: String(reporterName).trim() },
    { key: 'reporterPhone', value: reporter.phone }
  ];
  if (landmark && String(landmark).trim()) {
    extraDetails.push({ key: 'landmark', value: String(landmark).trim().slice(0, 500) });
  }
  if (media.some((m) => m.type === 'image')) {
    extraDetails.push({ key: 'hasImage', value: 'yes' });
  }
  if (media.some((m) => m.type === 'voice')) {
    extraDetails.push({ key: 'hasVoice', value: 'yes' });
  }

  const trackingCode = generateTrackingCode();

  const { rows } = await query(
    `INSERT INTO grievances (
       tracking_code, title, description, category, location, ward_id,
       citizen_id, extra_details, media, source
     ) VALUES (
       $1, $2, $3, 'cow_welfare',
       ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
       NULL, $6, $7::jsonb, $8::jsonb, 'cow_welfare'
     )
     RETURNING id`,
    [
      trackingCode,
      shortTitle,
      desc,
      lng,
      lat,
      reporter.id,
      JSON.stringify(extraDetails),
      JSON.stringify(media)
    ]
  );

  await query(
    `INSERT INTO status_history (grievance_id, from_status, to_status, changed_by, note)
     VALUES ($1, NULL, 'open', $2, 'Cow welfare concern raised by public')`,
    [rows[0].id, reporter.id]
  );

  await query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, meta)
     VALUES ($1, 'grievance.cow_welfare', 'grievance', $2, $3)`,
    [
      reporter.id,
      rows[0].id,
      JSON.stringify({
        trackingCode,
        lat,
        lng,
        mediaTypes: media.map((m) => m.type)
      })
    ]
  );

  return getById(rows[0].id, { id: reporter.id, role: ROLES.CITIZEN });
}

async function updateStatus(id, newStatus, user, note) {
  if (!STATUSES.includes(newStatus)) {
    throw new AppError(400, 'Invalid status.');
  }
  if (user.role === ROLES.CITIZEN) {
    throw new AppError(403, 'Citizens cannot change grievance status.');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM grievances WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const g = assertFound(rows[0], 'Grievance not found.');
    const allowed = STATUS_TRANSITIONS[g.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new AppError(422, `Cannot transition from "${g.status}" to "${newStatus}".`, {
        currentStatus: g.status,
        requestedStatus: newStatus,
        allowedTransitions: allowed
      });
    }

    const resolvedAt = newStatus === 'resolved' ? new Date() : g.resolved_at;
    await client.query(
      `UPDATE grievances SET status = $1, resolved_at = $2 WHERE id = $3`,
      [newStatus, resolvedAt, id]
    );
    await client.query(
      `INSERT INTO status_history (grievance_id, from_status, to_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, g.status, newStatus, user.id, note || null]
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, meta)
       VALUES ($1, 'grievance.status', 'grievance', $2, $3)`,
      [user.id, id, JSON.stringify({ from: g.status, to: newStatus })]
    );
  }).then(() => getById(id, user));
}

async function assignGrievance(id, assigneeId, user) {
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.OFFICER) {
    throw new AppError(403, 'Not allowed to assign grievances.');
  }

  const assignee = await query(
    `SELECT id, role FROM users WHERE id = $1 AND is_active AND role IN ('officer', 'admin')`,
    [assigneeId]
  );
  if (!assignee.rows[0]) {
    throw new AppError(400, 'Assignee must be an active officer or admin.');
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM grievances WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const g = assertFound(rows[0], 'Grievance not found.');

    let status = g.status;
    if (status === 'open') status = 'assigned';

    await client.query(
      `UPDATE grievances SET assignee_id = $1, status = $2 WHERE id = $3`,
      [assigneeId, status, id]
    );

    if (status !== g.status) {
      await client.query(
        `INSERT INTO status_history (grievance_id, from_status, to_status, changed_by, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, g.status, status, user.id, 'Assigned to officer']
      );
    }

    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, meta)
       VALUES ($1, 'grievance.assign', 'grievance', $2, $3)`,
      [user.id, id, JSON.stringify({ assigneeId })]
    );
  }).then(() => getById(id, user));
}

async function upvote(id, user) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM grievances WHERE id = $1 FOR UPDATE`,
      [id]
    );
    assertFound(rows[0], 'Grievance not found.');

    const existing = await client.query(
      `SELECT 1 FROM grievance_upvotes WHERE grievance_id = $1 AND user_id = $2`,
      [id, user.id]
    );
    if (existing.rows[0]) {
      throw new AppError(409, 'You have already upvoted this grievance.');
    }

    await client.query(
      `INSERT INTO grievance_upvotes (grievance_id, user_id) VALUES ($1, $2)`,
      [id, user.id]
    );
    const updated = await client.query(
      `UPDATE grievances SET upvote_count = upvote_count + 1
       WHERE id = $1 RETURNING upvote_count`,
      [id]
    );
    return { id, upvoteCount: updated.rows[0].upvote_count, hasUpvoted: true };
  });
}

async function removeUpvote(id, user) {
  return withTransaction(async (client) => {
    const del = await client.query(
      `DELETE FROM grievance_upvotes WHERE grievance_id = $1 AND user_id = $2
       RETURNING 1`,
      [id, user.id]
    );
    if (!del.rows[0]) {
      throw new AppError(404, 'You have not upvoted this grievance.');
    }
    const updated = await client.query(
      `UPDATE grievances SET upvote_count = GREATEST(upvote_count - 1, 0)
       WHERE id = $1 RETURNING upvote_count`,
      [id]
    );
    return { id, upvoteCount: updated.rows[0].upvote_count, hasUpvoted: false };
  });
}

async function nearby({ lat, lng, maxDistance = 5000, limit = 20 }, user) {
  validateCoordinates(lat, lng);
  const maxD = Math.min(Math.max(parseInt(maxDistance, 10) || 5000, 100), 50000);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const params = [lng, lat, maxD, lim];
  let upvoteSelect = ', FALSE AS has_upvoted';
  if (user) {
    upvoteSelect =
      ', EXISTS(SELECT 1 FROM grievance_upvotes u WHERE u.grievance_id = g.id AND u.user_id = $5) AS has_upvoted';
    params.push(user.id);
  }

  const { rows } = await query(
    `SELECT ${SELECT_FIELDS}${upvoteSelect},
            ST_Distance(g.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
     FROM grievances g
     LEFT JOIN wards w ON w.id = g.ward_id
     LEFT JOIN users c ON c.id = g.citizen_id
     LEFT JOIN users a ON a.id = g.assignee_id
     WHERE ST_DWithin(
       g.location,
       ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
       $3
     )
     AND g.status NOT IN ('rejected')
     ORDER BY distance_m ASC
     LIMIT $4`,
    params
  );

  return {
    data: rows.map((r) => ({
      ...mapGrievance(r),
      distanceMeters: Math.round(Number(r.distance_m))
    })),
    meta: { lat, lng, maxDistance: maxD, count: rows.length }
  };
}

async function getStatusHistory(id) {
  const exists = await query(`SELECT id FROM grievances WHERE id = $1`, [id]);
  assertFound(exists.rows[0], 'Grievance not found.');

  const { rows } = await query(
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            u.full_name AS changed_by_name, u.role AS changed_by_role
     FROM status_history h
     LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.grievance_id = $1
     ORDER BY h.created_at ASC`,
    [id]
  );
  return rows.map((r) => ({
    id: r.id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    note: r.note,
    changedByName: r.changed_by_name,
    changedByRole: r.changed_by_role,
    createdAt: r.created_at
  }));
}

async function adminStats() {
  const { rows } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d
    FROM grievances
  `);

  const byCategory = await query(`
    SELECT category, COUNT(*)::int AS count
    FROM grievances
    GROUP BY category
    ORDER BY count DESC
  `);

  return {
    counts: rows[0],
    byCategory: byCategory.rows
  };
}

async function listOfficers() {
  const { rows } = await query(
    `SELECT id, full_name, phone, role, ward_id
     FROM users
     WHERE role IN ('officer', 'admin') AND is_active
     ORDER BY full_name`
  );
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    role: r.role,
    wardId: r.ward_id
  }));
}

module.exports = {
  listGrievances,
  getById,
  getByTrackingCode,
  createGrievance,
  createCowWelfareReport,
  updateStatus,
  assignGrievance,
  upvote,
  removeUpvote,
  nearby,
  getStatusHistory,
  adminStats,
  listOfficers,
  mapGrievance,
  findOrCreateReporter,
  normalizePhone
};
