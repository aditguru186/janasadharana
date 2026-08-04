'use strict';

const fs = require('fs');
const path = require('path');
const { resolveMediaFile } = require('../utils/media');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac'
};

module.exports = async function mediaRoutes(fastify) {
  // GET /api/v1/media/:filename
  fastify.get(
    '/media/:filename',
    {
      schema: {
        params: {
          type: 'object',
          required: ['filename'],
          properties: {
            filename: { type: 'string', minLength: 3, maxLength: 180 }
          }
        }
      }
    },
    async (request, reply) => {
      const full = resolveMediaFile(request.params.filename);
      if (!full) {
        return reply.code(404).send({ statusCode: 404, error: 'Media not found.' });
      }
      const ext = path.extname(full).toLowerCase();
      const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
      const buf = fs.readFileSync(full);
      return reply
        .header('Content-Type', mime)
        .header('Cache-Control', 'public, max-age=86400')
        .send(buf);
    }
  );
};
