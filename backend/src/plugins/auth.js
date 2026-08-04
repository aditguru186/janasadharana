'use strict';

const fp = require('fastify-plugin');
const crypto = require('crypto');
const config = require('../config');
const authService = require('../services/authService');
const { AppError } = require('../utils/errors');
const { ROLES } = require('../utils/constants');

function parseDurationMs(spec) {
  const m = String(spec).match(/^(\d+)([smhd])$/);
  if (!m) return 15 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * unit;
}

async function authPlugin(fastify) {
  await fastify.register(require('@fastify/jwt'), {
    secret: config.jwt.accessSecret,
    sign: { expiresIn: config.jwt.accessTtl }
  });

  fastify.decorate('authenticate', async function authenticate(request) {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, 'Authentication required.');
    }

    const user = await authService.findUserById(request.user.sub);
    if (!user || !user.is_active) {
      throw new AppError(401, 'User account is inactive or not found.');
    }
    request.currentUser = {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      wardId: user.ward_id
    };
  });

  fastify.decorate('optionalAuth', async function optionalAuth(request) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      request.currentUser = null;
      return;
    }
    try {
      await request.jwtVerify();
      const user = await authService.findUserById(request.user.sub);
      if (user?.is_active) {
        request.currentUser = {
          id: user.id,
          phone: user.phone,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          wardId: user.ward_id
        };
      } else {
        request.currentUser = null;
      }
    } catch {
      request.currentUser = null;
    }
  });

  fastify.decorate('requireRoles', function requireRoles(...roles) {
    return async function roleGuard(request) {
      await fastify.authenticate(request);
      if (!roles.includes(request.currentUser.role)) {
        throw new AppError(403, 'Insufficient permissions.');
      }
    };
  });

  fastify.decorate('issueTokens', async function issueTokens(userRow, meta = {}) {
    const user = userRow.id
      ? userRow
      : userRow;

    const accessToken = fastify.jwt.sign({
      sub: user.id,
      role: user.role,
      phone: user.phone
    });

    // Opaque refresh token (mobile-friendly); only hash stored in DB
    const refreshToken = crypto.randomBytes(48).toString('base64url');
    await authService.storeRefreshToken(user.id, refreshToken, meta);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: config.jwt.accessTtl,
      expiresInSeconds: Math.floor(parseDurationMs(config.jwt.accessTtl) / 1000),
      user: authService.publicUser(user)
    };
  });
}

module.exports = fp(authPlugin);
module.exports.ROLES = ROLES;
