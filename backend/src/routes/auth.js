'use strict';

const authService = require('../services/authService');

module.exports = async function authRoutes(fastify) {
  const registerBody = {
    type: 'object',
    required: ['phone', 'password', 'fullName'],
    properties: {
      phone: { type: 'string', minLength: 10, maxLength: 15 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      fullName: { type: 'string', minLength: 2, maxLength: 120 },
      email: { type: 'string', format: 'email', maxLength: 255 }
    }
  };

  const loginBody = {
    type: 'object',
    required: ['phone', 'password'],
    properties: {
      phone: { type: 'string', minLength: 10, maxLength: 15 },
      password: { type: 'string', minLength: 1, maxLength: 128 }
    }
  };

  function clientMeta(request) {
    return {
      userAgent: request.headers['user-agent'] || null,
      ip: request.ip
    };
  }

  // POST /api/v1/auth/register
  fastify.post(
    '/register',
    {
      schema: { body: registerBody },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
    },
    async (request) => {
      const user = await authService.register(request.body);
      const tokens = await fastify.issueTokens(user, clientMeta(request));
      return { data: tokens };
    }
  );

  // POST /api/v1/auth/login
  fastify.post(
    '/login',
    {
      schema: { body: loginBody },
      config: { rateLimit: { max: 20, timeWindow: '15 minutes' } }
    },
    async (request) => {
      const user = await authService.verifyCredentials(
        request.body.phone,
        request.body.password
      );
      const tokens = await fastify.issueTokens(user, clientMeta(request));
      return { data: tokens };
    }
  );

  // POST /api/v1/auth/refresh
  fastify.post(
    '/refresh',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string', minLength: 20 } }
        }
      },
      config: { rateLimit: { max: 60, timeWindow: '15 minutes' } }
    },
    async (request) => {
      const user = await authService.consumeRefreshToken(request.body.refreshToken);
      const tokens = await fastify.issueTokens(user, clientMeta(request));
      return { data: tokens };
    }
  );

  // POST /api/v1/auth/logout
  fastify.post(
    '/logout',
    {
      schema: {
        body: {
          type: 'object',
          properties: { refreshToken: { type: 'string' } }
        }
      }
    },
    async (request) => {
      if (request.body?.refreshToken) {
        await authService.revokeRefreshToken(request.body.refreshToken);
      }
      return { data: { ok: true } };
    }
  );

  // GET /api/v1/auth/me
  fastify.get(
    '/me',
    { preHandler: [fastify.authenticate] },
    async (request) => ({ data: request.currentUser })
  );

  // POST /api/v1/auth/logout-all — revoke every session (mobile + web)
  fastify.post(
    '/logout-all',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      await authService.revokeAllUserTokens(request.currentUser.id);
      return { data: { ok: true } };
    }
  );
};
