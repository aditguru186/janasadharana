'use strict';

const cowConcernService = require('../services/cowConcernService');
const { ROLES } = require('../utils/constants');
const { isR2Configured, ensureBucket } = require('../utils/r2');

module.exports = async function cowConcernRoutes(fastify) {
  const uuidPattern =
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  fastify.get('/meta', async () => ({
    data: {
      concernTypes: cowConcernService.CONCERN_TYPES,
      statuses: cowConcernService.CONCERN_STATUSES,
      r2Configured: isR2Configured(),
      mediaFolders: ['voices', 'images', 'pdfs']
    }
  }));

  // Static path before /:id
  fastify.get(
    '/track/:code',
    {
      schema: {
        params: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', minLength: 8, maxLength: 20 } }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.getByTrackingCode(request.params.code);
      return { data };
    }
  );

  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            concernText: { type: 'string', maxLength: 5000 },
            concernType: {
              type: 'string',
              enum: cowConcernService.CONCERN_TYPES
            },
            reporterName: { type: 'string', maxLength: 120 },
            reporterPhone: { type: 'string', maxLength: 15 },
            landmark: { type: 'string', maxLength: 500 },
            location: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['Point'] },
                coordinates: {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 2,
                  maxItems: 2
                }
              }
            },
            voiceBase64: { type: 'string', maxLength: 2_800_000 },
            imageBase64: { type: 'string', maxLength: 1_600_000 },
            imagesBase64: {
              type: 'array',
              maxItems: 5,
              items: { type: 'string', maxLength: 1_600_000 }
            },
            pdfsBase64: {
              type: 'array',
              maxItems: 3,
              items: { type: 'string', maxLength: 3_000_000 }
            }
          }
        }
      },
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
    },
    async (request, reply) => {
      const data = await cowConcernService.createConcern(request.body);
      return reply.code(201).send({
        data,
        meta: {
          message: 'Concern registered. Ground agents will be notified.',
          trackPath: `/track?code=${data.trackingCode}`
        }
      });
    }
  );

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRoles(ROLES.OFFICER, ROLES.ADMIN)],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            concernType: { type: 'string' },
            assignedTo: { type: 'string' },
            q: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          }
        }
      }
    },
    async (request) => cowConcernService.listConcerns(request.query)
  );

  fastify.get(
    '/:id',
    {
      preHandler: [fastify.optionalAuth],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.getById(request.params.id);
      return { data };
    }
  );

  fastify.get(
    '/:id/history',
    {
      preHandler: [fastify.optionalAuth],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.getHistory(request.params.id);
      return { data };
    }
  );

  fastify.patch(
    '/:id/status',
    {
      preHandler: [fastify.requireRoles(ROLES.OFFICER, ROLES.ADMIN)],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } }
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: cowConcernService.CONCERN_STATUSES },
            note: { type: 'string', maxLength: 1000 }
          }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.updateStatus(
        request.params.id,
        request.body.status,
        request.currentUser,
        request.body.note
      );
      return { data };
    }
  );

  fastify.post(
    '/:id/assign',
    {
      preHandler: [fastify.requireRoles(ROLES.OFFICER, ROLES.ADMIN)],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } }
        },
        body: {
          type: 'object',
          required: ['agentId'],
          properties: { agentId: { type: 'string', pattern: uuidPattern } }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.assignConcern(
        request.params.id,
        request.body.agentId,
        request.currentUser
      );
      return { data };
    }
  );
};

module.exports.warmR2 = async function warmR2(log) {
  try {
    const res = await ensureBucket();
    if (log) log.info({ r2: res }, 'R2 bucket check');
    return res;
  } catch (err) {
    if (log) log.warn({ err: err.message }, 'R2 warm failed');
    return { ok: false, error: err.message };
  }
};
