import { tokengen } from './token';
import {
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemGetOptions,
  SNFSSession,
} from '../lib/snfs';
import crypto = require('crypto');

const MAX_SESSIONS = 1000;

// TODO: Load these from a file, but allow one to be generated
// to be generated each time the server starts. When refactoring to allow the key pair
// to be read from files, pull the key loading into the logic for
const { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 1024,
});

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

function encodeFSToken0(): string {
  const buffer = crypto.publicEncrypt(PUBLIC_KEY, Buffer.from('='));
  return buffer.toString('base64');
}
function encodeFSToken2(fsno: string, options: SNFSFileSystemGetOptions): string {
  const fsargs = JSON.stringify({ fsno, options });
  const buffer = crypto.publicEncrypt(PUBLIC_KEY, Buffer.from(fsargs, 'utf-8'));
  return buffer.toString('base64');
}
function decodeFSToken(fstoken: string): DecodedFSToken {
  const buffer = crypto.privateDecrypt(PRIVATE_KEY, Buffer.from(fstoken, 'base64'));
  const fsargs = buffer.toString('utf-8');
  if (fsargs == '=') {
    return null;
  }
  const { fsno, options } = JSON.parse(fsargs);
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
    if (fsargs == null) {
      return await this.session.fs();
    }
    const { fsno, options } = fsargs;
    return await this.session.fsget(fsno, options);
  }

  async fs(): Promise<FSWithToken> {
    const fs = await this.session.fs();
    const fstoken = encodeFSToken0();
    return { fs, fstoken };
  }

  async fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<FSWithToken> {
    const fs = await this.session.fsget(fsno, options);
    const fstoken = encodeFSToken2(fsno, options);
    return { fs, fstoken };
  }
}
