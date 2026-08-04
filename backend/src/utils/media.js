'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AppError } = require('./errors');

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const MAX_IMAGE_BYTES = 900 * 1024; // ~900KB
const MAX_VOICE_BYTES = 1.5 * 1024 * 1024; // ~1.5MB

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const VOICE_MIMES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/aac'
]);

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

/**
 * Parse data URL or raw base64 payload.
 * @returns {{ mime: string, buffer: Buffer }}
 */
function parseBase64Payload(input, kind) {
  if (!input || typeof input !== 'string') {
    throw new AppError(400, `${kind} payload is required when provided.`);
  }

  let mime = kind === 'image' ? 'image/jpeg' : 'audio/webm';
  let b64 = input.trim();

  const dataUrl = /^data:([^;]+);base64,(.+)$/s.exec(b64);
  if (dataUrl) {
    mime = dataUrl[1].toLowerCase();
    b64 = dataUrl[2];
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    throw new AppError(400, `Invalid ${kind} base64 data.`);
  }

  if (!buffer.length) {
    throw new AppError(400, `${kind} file is empty.`);
  }

  const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VOICE_BYTES;
  if (buffer.length > max) {
    throw new AppError(
      400,
      `${kind} is too large (max ${Math.round(max / 1024)} KB). Compress and retry.`
    );
  }

  const allowed = kind === 'image' ? IMAGE_MIMES : VOICE_MIMES;
  if (!allowed.has(mime)) {
    throw new AppError(400, `Unsupported ${kind} type: ${mime}`);
  }

  return { mime, buffer };
}

function extForMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac'
  };
  return map[mime] || 'bin';
}

/**
 * Save optional image/voice base64 payloads. Returns media metadata array.
 */
function saveCowWelfareMedia({ imageBase64, voiceBase64 }) {
  ensureUploadDir();
  const media = [];
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');

  if (imageBase64) {
    const { mime, buffer } = parseBase64Payload(imageBase64, 'image');
    const filename = `cow-${stamp}-${rand}-img.${extForMime(mime)}`;
    const full = path.join(UPLOAD_ROOT, filename);
    fs.writeFileSync(full, buffer);
    media.push({
      type: 'image',
      mime,
      filename,
      path: `/api/v1/media/${filename}`,
      sizeBytes: buffer.length
    });
  }

  if (voiceBase64) {
    const { mime, buffer } = parseBase64Payload(voiceBase64, 'voice');
    const filename = `cow-${stamp}-${rand}-voice.${extForMime(mime)}`;
    const full = path.join(UPLOAD_ROOT, filename);
    fs.writeFileSync(full, buffer);
    media.push({
      type: 'voice',
      mime,
      filename,
      path: `/api/v1/media/${filename}`,
      sizeBytes: buffer.length
    });
  }

  return media;
}

function resolveMediaFile(filename) {
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return null;
  }
  const full = path.join(UPLOAD_ROOT, filename);
  if (!full.startsWith(UPLOAD_ROOT)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

module.exports = {
  UPLOAD_ROOT,
  MAX_IMAGE_BYTES,
  MAX_VOICE_BYTES,
  saveCowWelfareMedia,
  resolveMediaFile,
  ensureUploadDir,
  parseBase64Payload
};
