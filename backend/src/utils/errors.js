'use strict';

class AppError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isAppError = true;
  }
}

function assertFound(row, message = 'Resource not found') {
  if (!row) throw new AppError(404, message);
  return row;
}

module.exports = { AppError, assertFound };
