'use strict';

const {
  CATEGORIES,
  STATUSES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_TRANSITIONS
} = require('../utils/constants');
const config = require('../config');

module.exports = async function metaRoutes(fastify) {
  /**
   * GET /api/v1/meta
   * Public catalog for web + mobile clients (enums, geofence, labels).
   */
  fastify.get('/meta', async () => ({
    data: {
      municipality: 'Puri Municipality',
      categories: CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
      statuses: STATUSES.map((id) => ({ id, label: STATUS_LABELS[id] })),
      statusTransitions: STATUS_TRANSITIONS,
      geofence: {
        center: { lat: config.geo.puriLat, lng: config.geo.puriLng },
        radiusMeters: config.geo.geofenceRadiusMeters
      },
      units: {
        cowWelfare: {
          id: 'cow_welfare',
          radiusKm: Math.round(config.geo.geofenceRadiusMeters / 1000),
          publicReportPath: '/api/v1/grievances/cow-welfare',
          media: ['text', 'image', 'voice'],
          languages: ['en', 'or']
        }
      },
      apiVersion: 'v1'
    }
  }));
};
