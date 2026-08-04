'use strict';

const config = require('../config');

const EARTH_RADIUS_M = 6371e3;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function assertInsidePuriGeofence(lat, lng) {
  const distance = haversineMeters(
    config.geo.puriLat,
    config.geo.puriLng,
    lat,
    lng
  );
  if (distance > config.geo.geofenceRadiusMeters) {
    const err = new Error(
      `Location is outside Puri Municipality bounds (max ${config.geo.geofenceRadiusMeters / 1000} km from city centre).`
    );
    err.statusCode = 400;
    err.details = {
      distanceMeters: Math.round(distance),
      maxAllowedMeters: config.geo.geofenceRadiusMeters
    };
    throw err;
  }
  return distance;
}

function validateCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    const err = new Error('Latitude and longitude must be numbers.');
    err.statusCode = 400;
    throw err;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    const err = new Error('Coordinates out of valid range.');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  haversineMeters,
  assertInsidePuriGeofence,
  validateCoordinates
};
