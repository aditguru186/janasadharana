'use strict';

const config = require('./config');
const { buildApp } = require('./app');
const { healthCheck, pool } = require('./db/pool');

async function main() {
  // Wait for DB (Coolify / compose race)
  let attempts = 0;
  while (attempts < 30) {
    try {
      await healthCheck();
      break;
    } catch (err) {
      attempts += 1;
      if (attempts >= 30) {
        console.error('Database not ready after 30 attempts', err.message);
        process.exit(1);
      }
      console.log(`Waiting for database... (${attempts}/30)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const app = await buildApp();

  const shutdown = async (signal) => {
    app.log.info(`Received ${signal}, shutting down`);
    try {
      await app.close();
      await pool.end();
      process.exit(0);
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Janasadharana API listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
