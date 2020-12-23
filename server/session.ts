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

function loadFSTokenSecret() {
  try {
    return fs.readFileSync('./fstoken.pem');
  } catch (err) {
    if (err.code == 'ENOENT') {
      console.log('FS Token Secret: Fallback to randomly generated value.');
      return crypto.randomBytes(32);
    }
    throw err;
  }
}

const SESTOKEN_SECRET = loadSessionTokenSecret();
const FSTOKEN_SECRET = loadFSTokenSecret();

class FSWithToken {
  fs: SNFSFileSystem;
  fstoken: string;
}

interface DecodedFSToken {
  fsno: string;
  options: SNFSFileSystemGetOptions,
}

function encodeFSToken(fsno: string, options: SNFSFileSystemGetOptions): string {
  // Note: no expiry, only interested is the ability to verify the payload signature.
  return jwt.sign({ fsno, options }, FSTOKEN_SECRET, { algorithm: 'HS256' });
}
function decodeFSToken(fstoken: string): DecodedFSToken {
  try {
    const fsargs = jwt.verify(fstoken, FSTOKEN_SECRET, { algorithms: ['HS256'] });
    const { fsno, options } = fsargs;
    return { fsno, options };
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      throw new SNFSError('Expired.');
    }
    throw err;
  }
}

export class ServerSessionManager {
  create(ses: SNFSSession): ServerSession {
    const session = new ServerSession();
    session._create(ses);
    return session;
  }

  lookup(snfs: SNFS, pool: string, token: string): ServerSession {
    const session = new ServerSession();
    session._lookup(snfs, pool, token);
    return session;
  }
}

export class ServerSession {
  token: string; // JWT encoded data.
  pool: string;
  userno: string;
  expires: Date;
  session: SNFSSession;

  _create(session: SNFSSession): void {
    // TODO: Need introspection methods to get at the current logged in user's info.
    const session0: any = session;
    const session1: SNFSSessionMemory = session0;
    const userno = session1._logged_in_userno;
    const expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
    this.token = jwt.sign({ userno, exp: Math.floor(expires.getTime() / 1000) }, SESTOKEN_SECRET, { algorithm: 'ES256' });
    this.pool = tokengen();
    this.userno = userno;
    this.expires = expires;
    this.session = session;
  }

  _lookup(snfs: SNFS, pool: string, token: string): void {
    try {
      const sesargs = jwt.verify(token, SESTOKEN_SECRET, { algorithms: ['ES256'] });
      const { userno } = sesargs;
      // TODO: Bypasses type system.
      const snfs0: any = snfs;
      const snfs1: SNFSMemory = snfs0;
      this.token = token;
      this.pool = pool;
      this.userno = userno;
      this.expires = null;
      this.session = snfs1._bypass(userno);
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        throw new SNFSError('Expired.');
      }
      throw err;
    }
  }

  updateExpires(): void {
    const expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
    const userno = this.userno;
    this.token = jwt.sign({ userno, exp: Math.floor(expires.getTime() / 1000) }, SESTOKEN_SECRET, { algorithm: 'ES256' });
    this.expires = expires;
  }

  async lookupFileSystem(fstoken: string): Promise<SNFSFileSystem> {
    const fsargs = decodeFSToken(fstoken);
    const { fsno, options } = fsargs;
    return await this.session.fsget(fsno, options);
  }

  async fs(): Promise<FSWithToken> {
    // TODO: Implement introspection on SNFSFileSystem to
    // allow acquiring the original acquiring options.
    const fs0 = await this.session.fs();
    const fs1: any = fs0;
    const fs: SNFSFileSystemMemoryUnion = fs1;
    const fstoken = encodeFSToken(fs.fsno, {
      // TODO: Accessing private for lack of introspection on
      // a FS which would indicate the unioned fs's.
      writeable: fs._writeable,
      union: fs._union.map(f => f.fsno),
    });
    return { fs, fstoken };
  }

  async fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<FSWithToken> {
    const fs = await this.session.fsget(fsno, options);
    const fstoken = encodeFSToken(fsno, options);
    return { fs, fstoken };
  }
}
