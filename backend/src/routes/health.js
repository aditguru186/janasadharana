'use strict';

const { healthCheck } = require('../db/pool');

module.exports = async function healthRoutes(fastify) {
  // Liveness — process is up
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'janasadharana-api',
    timestamp: new Date().toISOString()
  }));

  // Readiness — DB reachable (Coolify / K8s probes)
  fastify.get('/ready', async (request, reply) => {
    try {
      const ok = await healthCheck();
      if (!ok) throw new Error('db check failed');
      return { status: 'ready', database: 'up' };
    } catch {
      return reply.code(503).send({ status: 'not_ready', database: 'down' });
    }
  });
};
