'use strict';

const cowConcernService = require('../services/cowConcernService');
const { ROLES } = require('../utils/constants');

module.exports = async function agentRoutes(fastify) {
  const uuidPattern =
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  fastify.get('/available-count', async () => {
    const data = await cowConcernService.listAgents({ availableOnly: true });
    return { data: { count: data.length } };
  });

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRoles(ROLES.OFFICER, ROLES.ADMIN)],
      schema: {
        querystring: {
          type: 'object',
          properties: { availableOnly: { type: 'boolean', default: false } }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.listAgents({
        availableOnly: Boolean(request.query.availableOnly)
      });
      return { data };
    }
  );

  fastify.post(
    '/',
    {
      preHandler: [fastify.requireRoles(ROLES.ADMIN)],
      schema: {
        body: {
          type: 'object',
          required: ['fullName', 'phone'],
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 120 },
            phone: { type: 'string', minLength: 10, maxLength: 15 },
            email: { type: 'string', maxLength: 255 },
            areaCoverage: { type: 'string', maxLength: 200 },
            notes: { type: 'string', maxLength: 2000 },
            isAvailable: { type: 'boolean' }
          }
        }
      }
    },
    async (request, reply) => {
      const data = await cowConcernService.createAgent(request.body);
      return reply.code(201).send({ data });
    }
  );

  fastify.patch(
    '/:id',
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
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 120 },
            email: { type: 'string', maxLength: 255 },
            areaCoverage: { type: 'string', maxLength: 200 },
            notes: { type: 'string', maxLength: 2000 },
            isAvailable: { type: 'boolean' },
            isActive: { type: 'boolean' }
          }
        }
      }
    },
    async (request) => {
      const data = await cowConcernService.updateAgent(request.params.id, request.body);
      return { data };
    }
  );
};
