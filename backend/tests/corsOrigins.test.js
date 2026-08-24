'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCorsOrigins } = require('../src/utils/corsOrigins');

describe('parseCorsOrigins', () => {
  it('adds www counterpart when only apex is listed', () => {
    const origins = parseCorsOrigins('https://janasadharana.bytesphereinnovation.com');
    assert.ok(origins.includes('https://janasadharana.bytesphereinnovation.com'));
    assert.ok(origins.includes('https://www.janasadharana.bytesphereinnovation.com'));
  });

  it('adds apex counterpart when only www is listed', () => {
    const origins = parseCorsOrigins('https://www.janasadharana.bytesphereinnovation.com');
    assert.ok(origins.includes('https://janasadharana.bytesphereinnovation.com'));
    assert.ok(origins.includes('https://www.janasadharana.bytesphereinnovation.com'));
  });

  it('strips trailing slashes and keeps localhost without inventing www.localhost', () => {
    const origins = parseCorsOrigins('http://localhost:5431/');
    assert.deepEqual(origins, ['http://localhost:5431']);
  });
});
