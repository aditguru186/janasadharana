'use strict';

/**
 * Integration tests for public cow-welfare endpoint.
 * Requires DATABASE_URL pointing at a migrated PostGIS DB.
 * Skips automatically when DB is unreachable.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-min-32-characters!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-min-32-characters!';
process.env.ALLOW_INSECURE_DEFAULTS = 'true';
process.env.PURI_LAT = '19.8134';
process.env.PURI_LNG = '85.8245';
process.env.GEOFENCE_RADIUS_METERS = '20000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://janasadharana:janasadharana@localhost:15432/janasadharana';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'js-cow-api-'));
process.env.UPLOAD_DIR = tmp;

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app;
let dbOk = false;

async function canConnect() {
  try {
    const { pool } = require('../src/db/pool');
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

describe('cow welfare API', () => {
  before(async () => {
    dbOk = await canConnect();
    if (!dbOk) {
      console.warn('[skip] DATABASE_URL not reachable — integration tests skipped');
      return;
    }
    // Ensure migrations applied
    const { execFileSync } = require('child_process');
    try {
      execFileSync('node', ['src/db/migrate.js'], {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        stdio: 'pipe'
      });
    } catch (e) {
      console.warn('[skip] migrate failed', e.message);
      dbOk = false;
      return;
    }
    const { buildApp } = require('../src/app');
    app = await buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    if (app) await app.close();
    try {
      const { pool } = require('../src/db/pool');
      await pool.end();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('POST /api/v1/grievances/cow-welfare creates public report', async (t) => {
    if (!dbOk) return t.skip('DB unavailable');

    const phone = `9${String(Date.now()).slice(-9)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/grievances/cow-welfare',
      payload: {
        reporterName: 'Test Reporter',
        reporterPhone: phone,
        description: 'Cow injured near Grand Road temple gate, cannot stand.',
        animalType: 'cow',
        condition: 'injured',
        landmark: 'Grand Road',
        location: { type: 'Point', coordinates: [85.8245, 19.8134] },
        imageBase64: `data:image/png;base64,${TINY_PNG_B64}`
      }
    });

    assert.equal(res.statusCode, 201, res.body);
    const body = res.json();
    assert.ok(body.data.trackingCode.startsWith('PUR-'));
    assert.equal(body.data.category, 'cow_welfare');
    assert.equal(body.data.status, 'open');
    assert.equal(body.data.source, 'cow_welfare');
    assert.ok(Array.isArray(body.data.media));
    assert.equal(body.data.media[0].type, 'image');
  });

  it('rejects reports outside geofence', async (t) => {
    if (!dbOk) return t.skip('DB unavailable');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/grievances/cow-welfare',
      payload: {
        reporterName: 'Far Away',
        reporterPhone: '9876500001',
        description: 'Cow far from Puri should be rejected by geofence rules.',
        location: { type: 'Point', coordinates: [77.209, 28.6139] }
      }
    });

    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.match(body.error, /outside Puri/i);
  });

  it('requires location and contact fields', async (t) => {
    if (!dbOk) return t.skip('DB unavailable');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/grievances/cow-welfare',
      payload: {
        reporterName: 'X',
        description: 'missing phone and location'
      }
    });
    assert.equal(res.statusCode, 400);
  });

  it('public track returns cow welfare ticket', async (t) => {
    if (!dbOk) return t.skip('DB unavailable');

    const phone = `8${String(Date.now()).slice(-9)}`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/grievances/cow-welfare',
      payload: {
        reporterName: 'Tracker',
        reporterPhone: phone,
        description: 'Ox stranded near sea beach approach road side.',
        location: { type: 'Point', coordinates: [85.82, 19.81] }
      }
    });
    assert.equal(created.statusCode, 201);
    const code = created.json().data.trackingCode;

    const track = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/track/${code}`
    });
    assert.equal(track.statusCode, 200);
    assert.equal(track.json().data.category, 'cow_welfare');
  });

  it('meta includes cow welfare unit catalog', async (t) => {
    if (!dbOk) return t.skip('DB unavailable');

    const res = await app.inject({ method: 'GET', url: '/api/v1/meta' });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.ok(data.categories.some((c) => c.id === 'cow_welfare'));
    assert.equal(data.units.cowWelfare.id, 'cow_welfare');
    assert.equal(data.geofence.radiusMeters, 20000);
  });
});
