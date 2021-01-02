import {
  FsaddOptions,
  FsmodOptions,
  UseraddOptions,
  UsermodOptions,
  SNFS,
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemDel,
  FsgetOptions,
  SNFSFileSystemInfo,
  SNFSFileSystemLimits,
  SNFSFileSystemSessionDetail,
  SNFSFileSystemSessionInfo,
  SNFSLogout,
  SNFSMove,
  SNFSNodeKind,
  SNFSReadDir,
  SNFSReadFile,
  SNFSSession,
  SessionDetail,
  SessionInfo,
  SNFSStat,
  SNFSUnlink,
  UserdelResult,
  UserInfo,
  SNFSWriteFile,
  SNFSWriteFileOptions,
} from '../lib/snfs';
import {
  bufferToBase64,
  base64ToBuffer,
} from './buffer';

export interface LoginOptionsHttp {
  name: string;
  password: string;
}

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
  const response = await fetch(endpoint, init);
  const blob = await response.blob();
  if (blob.type !== 'application/json' && blob.type !== 'application/json; charset=utf-8') {
    console.error(response);
    throw new SNFSError('Response has unexepcted type.');
  }
  const text = await blob.text();
  const obj = JSON.parse(text);
  if (!response.ok) {
    if (typeof obj.message !== 'string') {
      throw new SNFSError('Failure.');
    }
    throw new SNFSError(obj.message);
  }
  return obj;
}

export class SNFSHttp extends SNFS {
  _api_root: string;

  constructor(api_root: string) {
    super();

    this._api_root = api_root;
  }

  async login(options: LoginOptionsHttp): Promise<SNFSSession> {
    const result = await apirequest(urljoin(this._api_root, 'login'), {
      name: options.name,
      password: options.password,
    });
    return new SNFSSessionHttp(this, result.pool, result.userno);
  }

  async resume(session_token: string): Promise<SNFSSession> {
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
    const result = await apirequest(urljoin(this._api_root, pool, 'resume'), {
    });
    return new SNFSSessionHttp(this, pool, result.userno);
  }
}

export class SNFSSessionHttp extends SNFSSession {
  _snfs: SNFSHttp;
  _api_root: string;
  _userno: string;
  pool: string;

  constructor(snfs: SNFSHttp, pool: string, userno: string) {
    super();

    this._snfs = snfs;
    this._api_root = snfs._api_root;
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
    const result = await apirequest(urljoin(this._api_root, this.pool, 'sesdetail'), {
    });
    return result;
  }

  async logout(): Promise<SNFSLogout> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'logout'), {
    });
    return result;
  }

  async useradd(options: UseraddOptions): Promise<UserInfo> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'useradd'), {
      options,
    });
    return result;
  }

  async usermod(userno: string, options: UsermodOptions): Promise<UserInfo> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'usermod'), {
      userno,
      options,
    });
    return result;
  }

  async userdel(userno: string): Promise<UserdelResult> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'userdel'), {
      userno,
    });
    return result;
  }

  async userlist(): Promise<UserInfo[]> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'userlist'), {
    });
    return result;
  }

  async fs(): Promise<SNFSFileSystem> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fs'), {
    });
    return new SNFSFileSystemHttp(this._snfs, this._api_root, this.pool, result.fs_token, result.fsno, result.union);
  }

  async fsget(fsno: string, options?: FsgetOptions): Promise<SNFSFileSystem> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fsget'), {
      fsno,
      options,
    });
    return new SNFSFileSystemHttp(this._snfs, this._api_root, this.pool, result.fs_token, result.fsno, result.union);
  }

  async fsresume(fs_token: string): Promise<SNFSFileSystem> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fsresume'), {
      fs_token,
    });
    return new SNFSFileSystemHttp(this._snfs, this._api_root, this.pool, fs_token, result.fsno, result.union);
  }

  async fsadd(options: FsaddOptions): Promise<SNFSFileSystemInfo> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fsadd'), {
      options,
    });
    return result;
  }

  async fsmod(fsno: string, options: FsmodOptions): Promise<SNFSFileSystemInfo> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fsmod'), {
      fsno,
      options,
    });
    return result;
  }

  async fsdel(fsno: string): Promise<SNFSFileSystemDel> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fsdel'), {
      fsno,
    });
    return result;
  }

  async fslist(): Promise<SNFSFileSystemInfo[]> {
    const result = await apirequest(urljoin(this._api_root, this.pool, 'fslist'), {
    });
    return result;
  }
}

export class SNFSFileSystemHttp extends SNFSFileSystem {
  _snfs: SNFSHttp;
  _api_root: string;
  _pool: string;
  _fs_token: string;
  _fsno: string;
  _union: string[];

  constructor(snfs: SNFSHttp, api_root: string, pool: string, fs_token: string, fsno: string, union: string[]) {
    super();

    this._snfs = snfs;
    this._api_root = api_root;
    this._pool = pool;
    this._fs_token = fs_token;
    this._fsno = fsno;
    this._union = union.slice();
  }

  info(): SNFSFileSystemSessionInfo {
    return {
      fs_token: this._fs_token,
      fsno: this._fsno,
      union: this._union,
    };
  }

  async detail(): Promise<SNFSFileSystemSessionDetail> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'fsdetail'), {
      fs_token: this._fs_token,
    });
    return result;
  }

  async readdir(path: string): Promise<SNFSReadDir[]> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'readdir'), {
      fs_token: this._fs_token,
      path,
    });
    return result;
  }

  async stat(path: string): Promise<SNFSStat> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'stat'), {
      fs_token: this._fs_token,
      path,
    });
    result.mtime = new Date(result.mtime);
    result.ctime = new Date(result.ctime);
    return result;
  }

  async writefile(path: string, data: Uint8Array, options?: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'writefile'), {
      fs_token: this._fs_token,
      path,
      data: bufferToBase64(data),
      options,
    });
    return result;
  }

  async readfile(path: string): Promise<SNFSReadFile> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'readfile'), {
      fs_token: this._fs_token,
      path,
    });
    result.data = base64ToBuffer(result.data);
    return result;
  }

  async unlink(path: string): Promise<SNFSUnlink> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'unlink'), {
      fs_token: this._fs_token,
      path,
    });
    return result;
  }

  async move(path: string, newpath: string): Promise<SNFSMove> {
    const result = await apirequest(urljoin(this._api_root, this._pool, 'move'), {
      fs_token: this._fs_token,
      path,
      newpath,
    });
    return result;
  }
}
