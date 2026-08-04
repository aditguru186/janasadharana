'use strict';

const grievanceService = require('../services/grievanceService');
const { ROLES } = require('../utils/constants');

module.exports = async function adminRoutes(fastify) {
  // GET /api/v1/admin/stats
  fastify.get(
    '/stats',
    { preHandler: [fastify.requireRoles(ROLES.OFFICER, ROLES.ADMIN)] },
    async () => {
      const data = await grievanceService.adminStats();
      return { data };
    }
  );

  // GET /api/v1/admin/officers
  fastify.get(
    '/officers',
    { preHandler: [fastify.requireRoles(ROLES.OFFICER, ROLES.ADMIN)] },
    async () => {
      const data = await grievanceService.listOfficers();
      return { data };
    }
  );
};
