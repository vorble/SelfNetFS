import { tokengen } from './token';
import {
  SNFS,
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemGetOptions,
  SNFSSession,
} from '../lib/snfs';
import {
  SNFSFileSystemMemoryUnion,
  SNFSMemory,
  SNFSSessionMemory,
} from '../lib/memory';
import crypto = require('crypto');
import jwt = require('jsonwebtoken');
import fs = require('fs');

function loadSessionTokenSecret() {
  try {
    return fs.readFileSync('./sestoken.pem');
  } catch (err) {
    if (err.code == 'ENOENT') {
      console.log('Session Token Secret: Fallback to randomly generated value.');
      return crypto.randomBytes(32);
    }
    throw err;
  }
}

const SESTOKEN_SECRET = loadSessionTokenSecret();

export class ServerSessionManager {
  create(ses: SNFSSession): ServerSession {
    const session = new ServerSession();
    session._create(ses);
    return session;
  }

  async lookup(snfs: SNFSMemory, pool: string, token: string): Promise<ServerSession> {
    const session = new ServerSession();
    await session._lookup(snfs, pool, token);
    return session;
  }
}

export class ServerSession {
  token: string; // JWT encoded data.
  pool: string;
  expires: Date;
  session: SNFSSession;

  _create(session: SNFSSession): void {
    const session_token = session.info().session_token;
    this.session = session;
    this.pool = tokengen();
    this.updateExpires();
  }

  async _lookup(snfs: SNFSMemory, pool: string, token: string): Promise<void> {
    try {
      const sesargs = jwt.verify(token, SESTOKEN_SECRET, { algorithms: ['ES256'] });
      const { session_token } = sesargs;
      if (typeof session_token !== 'string') {
        throw new SNFSError('Invalid token.');
      }
      this.token = token;
      this.pool = pool;
      this.expires = null;
      this.session = await snfs.resume(session_token);
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        throw new SNFSError('Expired.');
      }
      throw err;
    }
  }

  updateExpires(): void {
    const session_token = this.session.info().session_token;
    const expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
    this.token = jwt.sign({ session_token, exp: Math.floor(expires.getTime() / 1000) }, SESTOKEN_SECRET, { algorithm: 'ES256' });
    this.expires = expires;
  }
}
