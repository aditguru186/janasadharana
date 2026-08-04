'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');
const { query, withTransaction } = require('../db/pool');
const { AppError } = require('../utils/errors');
const { ROLES } = require('../utils/constants');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseDurationMs(spec) {
  const m = String(spec).match(/^(\d+)([smhd])$/);
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unit;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    wardId: row.ward_id,
    isActive: row.is_active !== undefined ? row.is_active : true,
    createdAt: row.created_at
  };
}

async function findUserByPhone(phone) {
  const { rows } = await query(
    `SELECT id, phone, email, password_hash, full_name, role, ward_id, is_active, created_at
     FROM users WHERE phone = $1`,
    [phone]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await query(
    `SELECT id, phone, email, password_hash, full_name, role, ward_id, is_active, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  throw new AppError(400, 'Phone must be a valid 10-digit Indian mobile number.');
}

async function register({ phone, password, fullName, email }) {
  const normalized = normalizePhone(phone);
  if (!password || password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters.');
  }
  if (!fullName || fullName.trim().length < 2) {
    throw new AppError(400, 'Full name is required.');
  }

  const existing = await findUserByPhone(normalized);
  if (existing) {
    throw new AppError(409, 'An account with this phone number already exists.');
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  const { rows } = await query(
    `INSERT INTO users (phone, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, phone, email, full_name, role, ward_id, is_active, created_at`,
    [normalized, email?.trim() || null, passwordHash, fullName.trim(), ROLES.CITIZEN]
  );

  await query(
    `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, meta)
     VALUES ($1, 'user.register', 'user', $1, $2)`,
    [rows[0].id, JSON.stringify({ phone: normalized })]
  );

  return rows[0];
}

async function verifyCredentials(phone, password) {
  const normalized = normalizePhone(phone);
  const user = await findUserByPhone(normalized);
  if (!user || !user.is_active) {
    throw new AppError(401, 'Invalid phone or password.');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw new AppError(401, 'Invalid phone or password.');
  }
  return user;
}

async function storeRefreshToken(userId, refreshToken, meta = {}) {
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDurationMs(config.jwt.refreshTtl));
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, meta.userAgent || null, meta.ip || null]
  );
}

/**
 * Validate opaque refresh token, revoke it, return user row.
 * Caller issues a new refresh token (rotation).
 */
async function consumeRefreshToken(refreshToken) {
  const oldHash = hashToken(refreshToken);
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT rt.id AS token_id, rt.expires_at, rt.revoked_at,
              u.id, u.phone, u.email, u.full_name, u.role, u.ward_id, u.is_active, u.created_at
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE OF rt`,
      [oldHash]
    );
    const row = rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) < new Date() || !row.is_active) {
      throw new AppError(401, 'Invalid or expired refresh token.');
    }

    await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [
      row.token_id
    ]);

    return {
      id: row.id,
      phone: row.phone,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      ward_id: row.ward_id,
      is_active: row.is_active,
      created_at: row.created_at
    };
  });
}

async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

async function revokeAllUserTokens(userId) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

module.exports = {
  publicUser,
  findUserById,
  findUserByPhone,
  register,
  verifyCredentials,
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  normalizePhone,
  hashToken
};
