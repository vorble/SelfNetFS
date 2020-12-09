import uuid = require('uuid');

export function tokengen() {
  return uuid.v4().replace(/-/g, '');
}
