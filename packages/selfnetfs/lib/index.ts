import axios from 'axios';
import {
  FSLimits,
  FileSystem,
  FileSystemDetail,
  FileSystemInfo,
  FsaddOptions,
  FsaddResult,
  FsdelResult,
  FsgetOptions,
  FslistResult,
  FsmodOptions,
  FsmodResult,
  GrantOptions,
  GrantResult,
  LoginOptions,
  LogoutResult,
  MoveResult,
  ReaddirResult,
  ReadfileResult,
  SNFS,
  SNFSError,
  Session,
  SessionDetail,
  SessionInfo,
  StatResult,
  UnlinkResult,
  UserInfo,
  UseraddOptions,
  UserdelResult,
  UsermodOptions,
  WritefileOptions,
  WritefileResult,
} from 'selfnetfs-common';
import {
  base64ToBuffer,
  bufferToBase64,
} from './buffer';

function urljoin(...parts: string[]): string {
  return parts.map(p => p.replace(/^\//, '').replace(/\/$/, '')).join('/');
}

async function apirequest(endpoint: string, payload: any) {
  const init: any = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
    },
    credentials: 'include',
  };
  if (payload == null) {
    // This is fine.
  } else if (typeof payload === 'object') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(payload);
  } else {
    throw new SNFSError('Invalid payload.');
  }
  try {
    const response = await axios({
      url: endpoint,
      method: 'POST',
      data: JSON.stringify(payload),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });
    // TODO: Might want to check some things about response.data.
    return response.data;
  } catch (err) {
    if (err.isAxiosError) {
      if (err.response && typeof err.response.data === 'object' && err.response.data !== null && typeof err.response.data.message === 'string' && err.response.data.message) {
        throw new SNFSError(err.response.data.message);
      }
      throw new SNFSError('Failure');
    }
    throw err;
  }
}

export class Http extends SNFS {
  _owner_url: string;

  constructor(owner_url: string) {
    super();

    this._owner_url = owner_url;
  }

  async login(options: LoginOptions): Promise<Session> {
    const result = await apirequest(urljoin(this._owner_url, 'login'), {
      name: options.name,
      password: options.password,
    });
    return new SessionHttp(this, result.pool, result.userno);
  }

  async resume(session_token: string): Promise<Session> {
    let tok = null;
    try {
      tok = JSON.parse(session_token);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new SNFSError('Invalid token.');
      }
      throw err;
    }
    const { pool } = tok;
    if (typeof pool !== 'string') {
      throw new SNFSError('Invalid token.');
    }
    const result = await apirequest(urljoin(this._owner_url, pool, 'resume'), {
    });
    return new SessionHttp(this, pool, result.userno);
  }
}

export class SessionHttp extends Session {
  _snfs: Http;
  _owner_url: string;
  _userno: string;
  pool: string;

  constructor(snfs: Http, pool: string, userno: string) {
    super();

    this._snfs = snfs;
    this._owner_url = snfs._owner_url;
    this._userno = userno;
    this.pool = pool;
  }

  info(): SessionInfo {
    return {
      session_token: JSON.stringify({
        pool: this.pool,
      }),
      userno: this._userno,
    };
  }

  async detail(): Promise<SessionDetail> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'sesdetail'), {
    });
    return result;
  }

  async logout(): Promise<LogoutResult> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'logout'), {
    });
    return result;
  }

  async useradd(options: UseraddOptions): Promise<UserInfo> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'useradd'), {
      options,
    });
    return result;
  }

  async usermod(userno: string, options: UsermodOptions): Promise<UserInfo> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'usermod'), {
      userno,
      options,
    });
    return result;
  }

  async userdel(userno: string): Promise<UserdelResult> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'userdel'), {
      userno,
    });
    return result;
  }

  async userlist(): Promise<UserInfo[]> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'userlist'), {
    });
    return result;
  }

  async fs(): Promise<FileSystem> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fs'), {
    });
    return new FileSystemHttp(this._snfs, this._owner_url, this.pool, result.fs_token, result.fsno, result.union);
  }

  async fsget(fsno: string, options?: FsgetOptions): Promise<FileSystem> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fsget'), {
      fsno,
      options,
    });
    return new FileSystemHttp(this._snfs, this._owner_url, this.pool, result.fs_token, result.fsno, result.union);
  }

  async fsresume(fs_token: string): Promise<FileSystem> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fsresume'), {
      fs_token,
    });
    return new FileSystemHttp(this._snfs, this._owner_url, this.pool, fs_token, result.fsno, result.union);
  }

  async fsadd(options: FsaddOptions): Promise<FsaddResult> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fsadd'), {
      options,
    });
    return result;
  }

  async fsmod(fsno: string, options: FsmodOptions): Promise<FsmodResult> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fsmod'), {
      fsno,
      options,
    });
    return result;
  }

  async fsdel(fsno: string): Promise<FsdelResult> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fsdel'), {
      fsno,
    });
    return result;
  }

  async fslist(): Promise<FslistResult[]> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'fslist'), {
    });
    return result;
  }

  async grant(userno: string, options: GrantOptions | GrantOptions[]): Promise<GrantResult> {
    const result = await apirequest(urljoin(this._owner_url, this.pool, 'grant'), {
      userno,
      options,
    });
    return result;
  }
}

export class FileSystemHttp extends FileSystem {
  _snfs: Http;
  _owner_url: string;
  _pool: string;
  _fs_token: string;
  _fsno: string;
  _union: string[];

  constructor(snfs: Http, owner_url: string, pool: string, fs_token: string, fsno: string, union: string[]) {
    super();

    this._snfs = snfs;
    this._owner_url = owner_url;
    this._pool = pool;
    this._fs_token = fs_token;
    this._fsno = fsno;
    this._union = union.slice();
  }

  info(): FileSystemInfo {
    return {
      fs_token: this._fs_token,
      fsno: this._fsno,
      union: this._union,
    };
  }

  async detail(): Promise<FileSystemDetail> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'fsdetail'), {
      fs_token: this._fs_token,
    });
    return result;
  }

  async readdir(path: string): Promise<ReaddirResult[]> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'readdir'), {
      fs_token: this._fs_token,
      path,
    });
    return result;
  }

  async stat(path: string): Promise<StatResult> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'stat'), {
      fs_token: this._fs_token,
      path,
    });
    result.mtime = new Date(result.mtime);
    result.ctime = new Date(result.ctime);
    return result;
  }

  async writefile(path: string, data: Uint8Array, options?: WritefileOptions): Promise<WritefileResult> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'writefile'), {
      fs_token: this._fs_token,
      path,
      data: bufferToBase64(data),
      options,
    });
    return result;
  }

  async readfile(path: string): Promise<ReadfileResult> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'readfile'), {
      fs_token: this._fs_token,
      path,
    });
    result.data = base64ToBuffer(result.data);
    return result;
  }

  async unlink(path: string): Promise<UnlinkResult> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'unlink'), {
      fs_token: this._fs_token,
      path,
    });
    return result;
  }

  async move(path: string, newpath: string): Promise<MoveResult> {
    const result = await apirequest(urljoin(this._owner_url, this._pool, 'move'), {
      fs_token: this._fs_token,
      path,
      newpath,
    });
    return result;
  }
}
