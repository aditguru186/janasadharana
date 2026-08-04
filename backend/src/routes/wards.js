'use strict';

const { query } = require('../db/pool');

module.exports = async function wardRoutes(fastify) {
  // GET /api/v1/wards
  fastify.get('/', async () => {
    const { rows } = await query(
      `SELECT id, code, name, description
       FROM wards
       WHERE is_active = TRUE
       ORDER BY code`
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description
      }))
    };
  });
};
