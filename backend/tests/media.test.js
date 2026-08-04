'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'js-media-'));
process.env.UPLOAD_DIR = tmp;
process.env.NODE_ENV = 'test';

const { parseBase64Payload, saveCowWelfareMedia, resolveMediaFile } = require('../src/utils/media');

// 1x1 PNG
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('media utils', () => {
  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('parses data URL image', () => {
    const { mime, buffer } = parseBase64Payload(
      `data:image/png;base64,${TINY_PNG_B64}`,
      'image'
    );
    assert.equal(mime, 'image/png');
    assert.ok(buffer.length > 10);
  });

  it('rejects oversized image payload', () => {
    const huge = Buffer.alloc(950 * 1024, 1).toString('base64');
    assert.throws(
      () => parseBase64Payload(`data:image/jpeg;base64,${huge}`, 'image'),
      (err) => err.statusCode === 400 && /too large/i.test(err.message)
    );
  });

  it('saves image media and resolves path', () => {
    const media = saveCowWelfareMedia({
      imageBase64: `data:image/png;base64,${TINY_PNG_B64}`
    });
    assert.equal(media.length, 1);
    assert.equal(media[0].type, 'image');
    assert.ok(media[0].path.startsWith('/api/v1/media/'));
    const full = resolveMediaFile(media[0].filename);
    assert.ok(full);
    assert.ok(fs.existsSync(full));
  });

  it('rejects path traversal filenames', () => {
    assert.equal(resolveMediaFile('../etc/passwd'), null);
    assert.equal(resolveMediaFile('a/b.png'), null);
  });
});
