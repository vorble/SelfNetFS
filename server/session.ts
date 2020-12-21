import { tokengen } from './token';
import {
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemGetOptions,
  SNFSSession,
} from '../lib/snfs';
import {
  SNFSFileSystemMemoryUnion,
} from '../lib/memory';
import crypto = require('crypto');
import jwt = require('jsonwebtoken')

const MAX_SESSIONS = 1000;
// TODO: Load this from a file, but allow one to be generated on each run.
const FSTOKEN_SECRET = crypto.randomBytes(32);

class FSWithToken {
  fs: SNFSFileSystem;
  fstoken: string;
}

class FSWithAccessTime {
  fs: SNFSFileSystem;
  fstoken: string;
  atime: Date; // Last access time
}

interface DecodedFSToken {
  fsno: string;
  options: SNFSFileSystemGetOptions,
}

function encodeFSToken(fsno: string, options: SNFSFileSystemGetOptions): string {
  // Note: no expiry, only interested is the ability to verify the payload.
  return jwt.sign({ fsno, options }, FSTOKEN_SECRET, { algorithm: 'HS256' });
}
function decodeFSToken(fstoken: string): DecodedFSToken {
  const fsargs = jwt.verify(fstoken, FSTOKEN_SECRET, { algorithms: ['HS256'] });
  const { fsno, options } = fsargs;
  return { fsno, options };
}

export class ServerSessionManager {
  _sessions: Map<string, ServerSession>;

  constructor() {
    this._sessions = new Map<string, ServerSession>();
  }

  create(ses: SNFSSession): ServerSession {
    this.reap();
    if (this._sessions.size >= MAX_SESSIONS) {
      throw new SNFSError('Too many open sessions.');
    }
    const session = new ServerSession(ses);
    this._sessions.set(session.token, session);
    return session;
  }

  lookup(token: string): ServerSession {
    this.reap();
    return this._sessions.get(token);
  }

  logout(token: string): ServerSession {
    this.reap();
    const session = this._sessions.get(token);
    this._sessions.delete(token);
    return session;
  }

  reap(): void {
    // TODO: Denial of service vector here. An attacker could
    // open up a bunch of sessions to make reap() take a long
    // time. Solution might be to limit number of sessions
    // available to one user group and/or use a better
    // storage mechanism to allow for quicker lookup based on
    // expires time.
    const now = new Date();
    for (const session of this._sessions.values()) {
      if (now > session.expires) {
        this._sessions.delete(session.token);
      }
    }
  }
}

export class ServerSession {
  token: string; // Secret data.
  pool: string;
  expires: Date;
  session: SNFSSession;

  constructor(session: SNFSSession) {
    const now = new Date();
    this.token = tokengen();
    this.pool = tokengen();
    this.expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
    this.session = session;
  }

  updateExpires(): void {
    this.expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
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
