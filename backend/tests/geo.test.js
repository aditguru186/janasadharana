'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Isolate geo math without loading full config/env
process.env.PURI_LAT = '19.8134';
process.env.PURI_LNG = '85.8245';
process.env.GEOFENCE_RADIUS_METERS = '20000';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-characters!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-characters!';
process.env.ALLOW_INSECURE_DEFAULTS = 'true';
process.env.NODE_ENV = 'test';

const {
  haversineMeters,
  assertInsidePuriGeofence,
  validateCoordinates
} = require('../src/utils/geo');

describe('geo utils', () => {
  it('haversine is ~0 at same point', () => {
    const d = haversineMeters(19.8134, 85.8245, 19.8134, 85.8245);
    assert.ok(d < 1);
  });

  it('accepts location inside Puri 20 km geofence', () => {
    const d = assertInsidePuriGeofence(19.82, 85.83);
    assert.ok(d < 20000);
  });

  it('rejects location far from Puri (e.g. Bhubaneswar centre is ok; Delhi not)', () => {
    assert.throws(
      () => assertInsidePuriGeofence(28.6139, 77.209),
      (err) => err.statusCode === 400 && /outside Puri/i.test(err.message)
    );
  });

  it('validateCoordinates rejects bad values', () => {
    assert.throws(() => validateCoordinates(NaN, 85), (err) => err.statusCode === 400);
    assert.throws(() => validateCoordinates(100, 85), (err) => err.statusCode === 400);
  });
});
