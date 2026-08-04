'use strict';

const { customAlphabet } = require('nanoid');

// Human-friendly tracking codes: PUR-XXXXXXXX
const nano = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

function generateTrackingCode() {
  return `PUR-${nano()}`;
}

module.exports = { generateTrackingCode };
