import crypto = require('crypto');

export function tokengen(): string {
  return crypto.randomBytes(32).toString('hex');
}
