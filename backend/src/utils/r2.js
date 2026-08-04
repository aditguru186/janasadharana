'use strict';

const {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand
} = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('./errors');

/** Logical kinds → physical folder under the R2 bucket */
const FOLDERS = {
  get voices() {
    return config.r2.audiosFolder || 'cow-welfare-audios';
  },
  get images() {
    return config.r2.artefactsFolder || 'cow-welfare-artefacts';
  },
  get pdfs() {
    return config.r2.pdfsFolder || config.r2.artefactsFolder || 'cow-welfare-artefacts';
  }
};

/** Resolve folder kinds used by uploadBuffer */
const FOLDER_KINDS = ['voices', 'images', 'pdfs'];

function resolveFolderName(kind) {
  if (kind === 'voices' || kind === 'audios') return FOLDERS.voices;
  if (kind === 'images' || kind === 'artefacts') return FOLDERS.images;
  if (kind === 'pdfs') return FOLDERS.pdfs;
  // allow passing a raw folder name
  if (Object.values(FOLDERS).includes(kind)) return kind;
  return null;
}

function folderPath(folderOrKind) {
  const folder = resolveFolderName(folderOrKind) || folderOrKind;
  const prefix = config.r2.keyPrefix;
  return prefix ? `${prefix}/${folder}` : folder;
}

let client = null;
let bucketReady = null;

function isR2Configured() {
  const r = config.r2;
  return !!(r.accountId && r.accessKeyId && r.secretAccessKey && r.bucketName);
}

function getClient() {
  if (!isR2Configured()) {
    throw new AppError(503, 'Cloudflare R2 is not configured. Set R2_* env vars.');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey
      }
    });
  }
  return client;
}

/**
 * Ensure the welfare media bucket exists (idempotent).
 * R2 CreateBucket is a no-op if you lack permission — we then rely on pre-created bucket.
 */
async function ensureBucket() {
  if (bucketReady) return bucketReady;
  if (!isR2Configured()) {
    bucketReady = Promise.resolve({ ok: false, reason: 'not_configured' });
    return bucketReady;
  }

  bucketReady = (async () => {
    const s3 = getClient();
    const Bucket = config.r2.bucketName;
    try {
      await s3.send(new HeadBucketCommand({ Bucket }));
      return { ok: true, bucket: Bucket, created: false };
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket }));
        await seedFolderMarkers(s3, Bucket);
        return { ok: true, bucket: Bucket, created: true };
      } catch (err) {
        // Fall back: bucket may need to be created in Cloudflare dashboard once
        console.warn(
          `[r2] Could not create bucket "${Bucket}". Trying uploads on existing bucket. ${err.message}`
        );
        try {
          await seedFolderMarkers(s3, Bucket);
        } catch (e2) {
          console.warn(`[r2] Folder seed skipped: ${e2.message}`);
        }
        return { ok: true, bucket: Bucket, created: false, warn: err.message };
      }
    }
  })();

  return bucketReady;
}

async function seedFolderMarkers(s3, Bucket) {
  const folders = [...new Set([FOLDERS.voices, FOLDERS.images, FOLDERS.pdfs])];
  for (const folder of folders) {
    await s3.send(
      new PutObjectCommand({
        Bucket,
        Key: `${folderPath(folder)}/.keep`,
        Body: Buffer.from(''),
        ContentType: 'application/octet-stream'
      })
    );
  }
}

function publicUrlForKey(key) {
  const base = (config.r2.publicUrl || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/${key}`;
}

function extForMime(mime, folder) {
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
    'audio/aac': 'aac',
    'application/pdf': 'pdf'
  };
  if (map[mime]) return map[mime];
  const resolved = resolveFolderName(folder) || folder;
  if (resolved === FOLDERS.images || resolved === FOLDERS.pdfs) {
    if (folder === 'pdfs' || kindIsPdf(mime)) return 'pdf';
    return 'jpg';
  }
  if (resolved === FOLDERS.voices) return 'webm';
  return 'bin';
}

function kindIsPdf(mime) {
  return mime === 'application/pdf';
}

/**
 * @param {{ buffer: Buffer, mime: string, folder: 'voices'|'images'|'pdfs'|string, originalName?: string }} opts
 * @returns {Promise<{ key: string, bucket: string, url: string|null, mime: string, sizeBytes: number, filename: string, folder: string }>}
 */
async function uploadBuffer({ buffer, mime, folder, originalName }) {
  if (!buffer?.length) throw new AppError(400, 'Empty upload payload.');
  const kind = FOLDER_KINDS.includes(folder) ? folder : null;
  const folderName = resolveFolderName(folder);
  if (!folderName) {
    throw new AppError(400, `Invalid media folder: ${folder}`);
  }

  await ensureBucket();
  const s3 = getClient();
  const Bucket = config.r2.bucketName;
  const stamp = Date.now();
  const rand = crypto.randomBytes(6).toString('hex');
  const ext = extForMime(mime, kind || folder);
  const safeBase = (originalName || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 40);
  const filename = `${stamp}-${rand}-${safeBase}.${ext}`.replace(/\.+/g, '.');
  const key = `${folderPath(folderName)}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: key,
      Body: buffer,
      ContentType: mime || 'application/octet-stream'
    })
  );

  return {
    key,
    bucket: Bucket,
    url: publicUrlForKey(key),
    mime: mime || 'application/octet-stream',
    sizeBytes: buffer.length,
    filename,
    folder: folderName,
    kind: kind || null,
    prefix: config.r2.keyPrefix || null
  };
}

function parseDataUrlOrBase64(input, kind) {
  if (!input || typeof input !== 'string') {
    throw new AppError(400, `${kind} payload missing.`);
  }
  let mime =
    kind === 'image'
      ? 'image/jpeg'
      : kind === 'pdf'
        ? 'application/pdf'
        : 'audio/webm';
  let b64 = input.trim();
  const m = /^data:([^;]+);base64,(.+)$/s.exec(b64);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[2];
  }
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new AppError(400, `${kind} file is empty.`);

  const limits = {
    image: config.r2.maxImageBytes,
    voice: config.r2.maxVoiceBytes,
    pdf: config.r2.maxPdfBytes
  };
  const max = limits[kind] || 2_000_000;
  if (buffer.length > max) {
    throw new AppError(
      400,
      `${kind} is too large (max ${Math.round(max / 1024)} KB).`
    );
  }
  return { mime, buffer };
}

/**
 * Upload optional voice / multi-images / multi-pdfs for a cow concern.
 */
async function uploadCowConcernMedia({ voiceBase64, imagesBase64 = [], pdfsBase64 = [] }) {
  if (!isR2Configured()) {
    // Dev fallback: local-style metadata without cloud (still storable in DB)
    const localMeta = (kind, b64, folder) => {
      if (!b64) return null;
      const { mime, buffer } = parseDataUrlOrBase64(b64, kind);
      const filename = `local-${Date.now()}-${kind}.${extForMime(mime, folder)}`;
      return {
        key: `${folder}/${filename}`,
        bucket: 'local-dev',
        url: null,
        mime,
        sizeBytes: buffer.length,
        filename,
        folder,
        localOnly: true
      };
    };
    const voice_id = voiceBase64 ? localMeta('voice', voiceBase64, FOLDERS.voices) : null;
    const images = (imagesBase64 || [])
      .filter(Boolean)
      .slice(0, 5)
      .map((b) => localMeta('image', b, FOLDERS.images));
    const pdfs = (pdfsBase64 || [])
      .filter(Boolean)
      .slice(0, 3)
      .map((b) => localMeta('pdf', b, FOLDERS.pdfs));
    return { voice_id, images, pdfs, storage: 'local-fallback' };
  }

  let voice_id = null;
  if (voiceBase64) {
    const { mime, buffer } = parseDataUrlOrBase64(voiceBase64, 'voice');
    voice_id = await uploadBuffer({ buffer, mime, folder: FOLDERS.voices, originalName: 'voice' });
  }

  const images = [];
  for (const b64 of (imagesBase64 || []).filter(Boolean).slice(0, 5)) {
    const { mime, buffer } = parseDataUrlOrBase64(b64, 'image');
    images.push(
      await uploadBuffer({ buffer, mime, folder: FOLDERS.images, originalName: 'photo' })
    );
  }

  const pdfs = [];
  for (const b64 of (pdfsBase64 || []).filter(Boolean).slice(0, 3)) {
    const { mime, buffer } = parseDataUrlOrBase64(b64, 'pdf');
    pdfs.push(await uploadBuffer({ buffer, mime, folder: FOLDERS.pdfs, originalName: 'doc' }));
  }

  return { voice_id, images, pdfs, storage: 'r2' };
}

module.exports = {
  FOLDERS,
  FOLDER_KINDS,
  isR2Configured,
  ensureBucket,
  uploadBuffer,
  uploadCowConcernMedia,
  parseDataUrlOrBase64,
  publicUrlForKey,
  getClient,
  resolveFolderName,
  folderPath
};
