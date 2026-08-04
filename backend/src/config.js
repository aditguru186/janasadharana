const path = require('path');
const fs = require('fs');

const rootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnv)) {
  require('dotenv').config({ path: rootEnv });
} else {
  require('dotenv').config();
}

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: parseInt(process.env.PORT || '5430', 10),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ||
    `postgres://${process.env.POSTGRES_USER || 'janasadharana'}:${process.env.POSTGRES_PASSWORD || 'janasadharana'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '15432'}/${process.env.POSTGRES_DB || 'janasadharana'}`,
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d'
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5431')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute'
  },
  geo: {
    puriLat: parseFloat(process.env.PURI_LAT || '19.8134'),
    puriLng: parseFloat(process.env.PURI_LNG || '85.8245'),
    geofenceRadiusMeters: parseInt(process.env.GEOFENCE_RADIUS_METERS || '20000', 10)
  },
  seed: {
    adminPhone: process.env.SEED_ADMIN_PHONE || '9999999999',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMeAdmin!23',
    officerPhone: process.env.SEED_OFFICER_PHONE || '8888888888',
    officerPassword: process.env.SEED_OFFICER_PASSWORD || 'ChangeMeOfficer!23'
  },
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    /**
     * Cow welfare media (Cloudflare R2)
     * Bucket: cow-welfare-puri
     *   cow-welfare-artefacts/  → images (+ PDFs)
     *   cow-welfare-audios/     → voice notes
     *
     * Credentials can be the same account keys as bytesphereinnovation / odia-ai-voice;
     * only the bucket name + public URL need to match the new bucket.
     */
    bucketName: process.env.R2_BUCKET_NAME || 'cow-welfare-puri',
    /** Optional root prefix (usually empty when folder names below are full paths). */
    keyPrefix: (process.env.R2_KEY_PREFIX || '').replace(/^\/|\/$/g, ''),
    /** Folder keys inside the bucket */
    artefactsFolder: (
      process.env.R2_ARTEFACTS_FOLDER ||
      process.env.R2_IMAGES_FOLDER ||
      'cow-welfare-artefacts'
    ).replace(/^\/|\/$/g, ''),
    audiosFolder: (
      process.env.R2_AUDIOS_FOLDER ||
      process.env.R2_VOICES_FOLDER ||
      'cow-welfare-audios'
    ).replace(/^\/|\/$/g, ''),
    pdfsFolder: (process.env.R2_PDFS_FOLDER || 'cow-welfare-artefacts').replace(
      /^\/|\/$/g,
      ''
    ),
    publicUrl: process.env.R2_PUBLIC_URL || '',
    maxImageBytes: parseInt(process.env.R2_MAX_IMAGE_BYTES || String(900 * 1024), 10),
    maxVoiceBytes: parseInt(process.env.R2_MAX_VOICE_BYTES || String(1.5 * 1024 * 1024), 10),
    maxPdfBytes: parseInt(process.env.R2_MAX_PDF_BYTES || String(2 * 1024 * 1024), 10)
  }
};

const weakSecret = (s) =>
  !s ||
  s.length < 32 ||
  /change-me|replace-with|dev-access|dev-refresh/i.test(s);

if (isProd && (weakSecret(config.jwt.accessSecret) || weakSecret(config.jwt.refreshSecret))) {
  if (process.env.ALLOW_INSECURE_DEFAULTS === 'true') {
    console.warn(
      '[security] Weak JWT secrets allowed via ALLOW_INSECURE_DEFAULTS=true — do not use in public deploys'
    );
  } else {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be strong (≥32 chars) in production. Set ALLOW_INSECURE_DEFAULTS=true only for local smoke tests.'
    );
  }
}

module.exports = config;
