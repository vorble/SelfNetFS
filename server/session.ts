import {
  SNFS,
  SNFSError,
  Session,
} from '../lib/snfs';
import {
  Memory,
  SessionMemory,
} from '../lib/memory';
import crypto = require('crypto');
import jwt = require('jsonwebtoken');
import fs = require('fs');

function loadSessionTokenPrivateKey() {
  try {
    return fs.readFileSync('./sestoken.pem');
  } catch (err) {
    if (err.code == 'ENOENT') {
      console.log('Session Token Private Key: Fallback to randomly generated value.');
      const { privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });
      return privateKey;
    }
    throw err;
  }
}

const SESTOKEN_PRIVATE_KEY = loadSessionTokenPrivateKey();

function makeExpires() {
  return new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
}

function makePool() {
  return crypto.randomBytes(16).toString('hex');
}

function makeToken(session_token: string, expires: Date) {
  return jwt.sign({
    session_token,
    exp: Math.floor(expires.getTime() / 1000),
  }, SESTOKEN_PRIVATE_KEY, { algorithm: 'ES256' });
}

export class ServerSessionManager {
  create(session: Session): ServerSession {
    const expires = makeExpires();
    const pool = makePool();
    const token = makeToken(session.info().session_token, expires);
    return new ServerSession(token, pool, session, expires);
  }

  lookup(snfs: Memory, pool: string, token: string): ServerSession {
    try {
      const sesargs: any = jwt.verify(token, SESTOKEN_PRIVATE_KEY, { algorithms: ['ES256'] });
      if (typeof sesargs !== 'object') {
        throw new SNFSError('Invalid token.');
      }
      const { session_token } = sesargs;
      if (typeof session_token !== 'string') {
        throw new SNFSError('Invalid token.');
      }
      const session = snfs._resume(session_token); // Bad accessing privates.
      return new ServerSession(token, pool, session, new Date());
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        throw new SNFSError('Expired.');
      }
      throw err;
    }
  }
}

export class ServerSession {
  token: string; // JWT encoded data.
  pool: string;
  session: Session;
  expires: Date;

  constructor(token: string, pool: string, session: Session, expires: Date) {
    this.token = token;
    this.pool = pool;
    this.session = session;
    this.expires = expires;
  }

  updateExpires() {
    this.expires = makeExpires();
    this.token = makeToken(this.session.info().session_token, this.expires);
  }
}
