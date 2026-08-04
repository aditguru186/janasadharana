'use strict';

const grievanceService = require('../services/grievanceService');
const { CATEGORIES, STATUSES, ROLES } = require('../utils/constants');

module.exports = async function grievanceRoutes(fastify) {
  const uuidPattern =
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  // GET /api/v1/grievances
  fastify.get(
    '/',
    {
      preHandler: [fastify.optionalAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: CATEGORIES },
            status: { type: 'string', enum: STATUSES },
            wardId: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            q: { type: 'string', maxLength: 100 },
            mine: { type: 'boolean', default: false },
            assigneeId: { type: 'string' }
          }
        }
      }
    },
    async (request) => {
      const filters = { ...request.query };
      if (filters.mine && !request.currentUser) {
        const err = new Error('Authentication required to list your grievances.');
        err.statusCode = 401;
        throw err;
      }
      return grievanceService.listGrievances(filters, request.currentUser);
    }
  );

  // GET /api/v1/grievances/mine
  fastify.get(
    '/mine',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      return grievanceService.listGrievances(
        { ...request.query, mine: true, page: request.query.page || 1, limit: request.query.limit || 20 },
        request.currentUser
      );
    }
  );

  // GET /api/v1/grievances/nearby
  fastify.get(
    '/nearby',
    {
      preHandler: [fastify.optionalAuth],
      schema: {
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            maxDistance: { type: 'integer', minimum: 100, maximum: 50000, default: 5000 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          }
        }
      }
    },
    async (request) => grievanceService.nearby(request.query, request.currentUser)
  );

  // GET /api/v1/grievances/track/:code  (public)
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
      const data = await grievanceService.getByTrackingCode(request.params.code);
      return { data };
    }
  );

  // GET /api/v1/grievances/:id
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
      const data = await grievanceService.getById(request.params.id, request.currentUser);
      return { data };
    }
  );

  // GET /api/v1/grievances/:id/history
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
      const data = await grievanceService.getStatusHistory(request.params.id);
      return { data };
    }
  );

  // POST /api/v1/grievances
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['title', 'description', 'category', 'location'],
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 200 },
            description: { type: 'string', minLength: 10, maxLength: 5000 },
            category: { type: 'string', enum: CATEGORIES },
            wardId: { type: 'string' },
            location: {
              type: 'object',
              required: ['type', 'coordinates'],
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
            extraDetails: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['key', 'value'],
                properties: {
                  key: { type: 'string', maxLength: 80 },
                  value: { type: 'string', maxLength: 500 }
                }
              }
            }
          }
        }
      },
      config: { rateLimit: { max: 30, timeWindow: '1 hour' } }
    },
    async (request, reply) => {
      const data = await grievanceService.createGrievance(request.body, request.currentUser);
      return reply.code(201).send({ data });
    }
  );

  /**
   * POST /api/v1/grievances/cow-welfare
   * Public — no login. Any phone user can raise a cow/ox concern in the Puri 20km zone.
   * Body: reporterName, reporterPhone, description, location, optional image/voice base64.
   */
  fastify.post(
    '/cow-welfare',
    {
      schema: {
        body: {
          type: 'object',
          required: ['reporterName', 'reporterPhone', 'description', 'location'],
          properties: {
            reporterName: { type: 'string', minLength: 2, maxLength: 120 },
            reporterPhone: { type: 'string', minLength: 10, maxLength: 15 },
            description: { type: 'string', minLength: 5, maxLength: 5000 },
            title: { type: 'string', maxLength: 200 },
            animalType: {
              type: 'string',
              enum: ['cow', 'ox', 'bull', 'calf', 'buffalo', 'other'],
              default: 'cow'
            },
            condition: {
              type: 'string',
              enum: [
                'injured',
                'unwell',
                'stranded',
                'hit_by_vehicle',
                'malnourished',
                'other'
              ],
              default: 'injured'
            },
            landmark: { type: 'string', maxLength: 500 },
            location: {
              type: 'object',
              required: ['type', 'coordinates'],
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
            imageBase64: { type: 'string', maxLength: 1_600_000 },
            voiceBase64: { type: 'string', maxLength: 2_800_000 }
          }
        }
      },
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } }
    },
    async (request, reply) => {
      const data = await grievanceService.createCowWelfareReport(request.body);
      return reply.code(201).send({
        data,
        meta: {
          message:
            'Concern registered. Ground staff will be notified. Use the tracking code to follow progress.',
          trackPath: `/track?code=${data.trackingCode}`
        }
      });
    }
  );

  // PATCH /api/v1/grievances/:id/status  (staff only)
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
            status: { type: 'string', enum: STATUSES },
            note: { type: 'string', maxLength: 1000 }
          }
        }
      }
    },
    async (request) => {
      const data = await grievanceService.updateStatus(
        request.params.id,
        request.body.status,
        request.currentUser,
        request.body.note
      );
      return { data };
    }
  );

  // POST /api/v1/grievances/:id/assign  (staff)
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
          required: ['assigneeId'],
          properties: { assigneeId: { type: 'string', pattern: uuidPattern } }
        }
      }
    },
    async (request) => {
      const data = await grievanceService.assignGrievance(
        request.params.id,
        request.body.assigneeId,
        request.currentUser
      );
      return { data };
    }
  );

  // POST /api/v1/grievances/:id/upvote
  fastify.post(
    '/:id/upvote',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } }
        }
      },
      config: { rateLimit: { max: 60, timeWindow: '1 hour' } }
    },
    async (request) => {
      const data = await grievanceService.upvote(request.params.id, request.currentUser);
      return { data };
    }
  );

  // DELETE /api/v1/grievances/:id/upvote
  fastify.delete(
    '/:id/upvote',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: uuidPattern } }
        }
      }
    },
    async (request) => {
      const data = await grievanceService.removeUpvote(
        request.params.id,
        request.currentUser
      );
      return { data };
    }
  );
};
