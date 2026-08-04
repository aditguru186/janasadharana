'use strict';

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const sensible = require('@fastify/sensible');
const config = require('./config');
const authPlugin = require('./plugins/auth');
const { AppError } = require('./utils/errors');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const grievanceRoutes = require('./routes/grievances');
const wardRoutes = require('./routes/wards');
const adminRoutes = require('./routes/admin');
const metaRoutes = require('./routes/meta');
const mediaRoutes = require('./routes/media');
const cowConcernRoutes = require('./routes/cowConcerns');
const agentRoutes = require('./routes/agents');
const { ensureUploadDir } = require('./utils/media');
const { isR2Configured } = require('./utils/r2');

async function buildApp(opts = {}) {
  ensureUploadDir();

  const app = Fastify({
    logger:
      opts.logger !== undefined
        ? opts.logger
        : config.isProd
          ? true
          : {
              transport: {
                target: 'pino-pretty',
                options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
              }
            },
    trustProxy: true,
    // Cow welfare may attach image + short voice note as base64
    bodyLimit: 4_000_000,
    genReqId: (req) => req.headers['x-request-id'] || undefined
  });

  await app.register(sensible);
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // mobile apps / curl
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      // Coolify preview / same-host flexibility in non-strict cases
      if (!config.isProd) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
  });
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    allowList: ['127.0.0.1'],
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too many requests. Please slow down.',
      details: undefined
    })
  });

  await app.register(authPlugin);

  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Validation failed',
        details: err.validation
      });
    }

    if (err.isAppError || err.statusCode) {
      const status = err.statusCode || 500;
      return reply.code(status).send({
        statusCode: status,
        error: err.message,
        ...(err.details && { details: err.details })
      });
    }

    if (err.message === 'Not allowed by CORS') {
      return reply.code(403).send({ statusCode: 403, error: 'Origin not allowed' });
    }

    request.log.error(err);
    return reply.code(500).send({
      statusCode: 500,
      error: config.isProd ? 'Internal server error' : err.message
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      statusCode: 404,
      error: `Route ${request.method} ${request.url} not found`
    });
  });

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(metaRoutes, { prefix: '/api/v1' });
  await app.register(mediaRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(wardRoutes, { prefix: '/api/v1/wards' });
  await app.register(grievanceRoutes, { prefix: '/api/v1/grievances' });
  await app.register(cowConcernRoutes, { prefix: '/api/v1/cow-concerns' });
  await app.register(agentRoutes, { prefix: '/api/v1/agents' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });

  // Root for load balancers that hit /
  app.get('/', async () => ({
    name: 'Janasadharana API',
    municipality: 'Puri',
    version: '2.1.0',
    docs: '/api/v1/meta',
    cowWelfare: '/api/v1/cow-concerns',
    r2: isR2Configured()
  }));

  if (isR2Configured() && cowConcernRoutes.warmR2) {
    app.addHook('onReady', async () => {
      await cowConcernRoutes.warmR2(app.log);
    });
  }

  return app;
}

module.exports = { buildApp, AppError };
