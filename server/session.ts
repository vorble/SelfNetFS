import { tokengen } from './token';
import {
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemGetOptions,
  SNFSSession,
} from '../lib/snfs';

const MAX_SESSIONS = 1000;
const MAX_FSS = 10;

class FSWithToken {
  fs: SNFSFileSystem;
  fstoken: string;
}

class FSWithAccessTime {
  fs: SNFSFileSystem;
  fstoken: string;
  atime: Date; // Last access time
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
  fss: Map<string, FSWithAccessTime>;

  constructor(session: SNFSSession) {
    const now = new Date();
    this.token = tokengen();
    this.pool = tokengen();
    this.expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
    this.session = session;
    this.fss = new Map<string, FSWithAccessTime>();
  }

  updateExpires(): void {
    this.expires = new Date(new Date().getTime() + 60 * 60 * 24 * 30 * 1000); // 30 days
  }

  lookupFileSystem(fstoken: string): SNFSFileSystem {
    const fswat = this.fss.get(fstoken);
    if (fswat != null) {
      fswat.atime = new Date();
      return fswat.fs;
    }
    return null;
  }

  async fs(): Promise<FSWithToken> {
    this.reap();
    const fs = await this.session.fs();
    const fstoken = tokengen();
    const atime = new Date();
    this.fss.set(fstoken, {
      fs,
      fstoken,
      atime,
    });
    return { fs, fstoken };
  }

  async fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<FSWithToken> {
    this.reap();
    const fs = await this.session.fsget(fsno, options);
    const fstoken = tokengen();
    const atime = new Date();
    this.fss.set(fstoken, {
      fs,
      fstoken,
      atime,
    });
    return { fs, fstoken };
  }

  reap(): void {
    if (this.fss.size >= MAX_FSS) {
      let stale = null;
      for (const fswat of this.fss.values()) {
        if (stale == null || fswat.atime < stale.atime) {
          stale = fswat;
        }
      }
      if (stale != null) {
        this.fss.delete(stale.fstoken);
      }
    }
  }
}
