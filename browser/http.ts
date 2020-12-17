import {
  SNFS,
  SNFSAuthCredentials,
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemGetOptions,
  SNFSFileSystemInfo,
  SNFSFileSystemOptions,
  SNFSFileSystemLimits,
  SNFSMove,
  SNFSNodeKind,
  SNFSReadDir,
  SNFSReadFile,
  SNFSSession,
  SNFSStat,
  SNFSUnlink,
  SNFSUserInfo,
  SNFSUserOptions,
  SNFSWriteFile,
  SNFSWriteFileOptions,
} from '../lib/snfs';
import {
  bufferToBase64,
  base64ToBuffer,
} from './buffer';

export interface SNFSAuthCredentialsHttp extends SNFSAuthCredentials {
  api_root: string;
  name: string;
  password: string;
}

async function apirequest(endpoint: string, payload) {
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
  constructor() {
    super();
  }

  async login(options: SNFSAuthCredentialsHttp): Promise<SNFSSession> {
    const result = await apirequest(options.api_root + '/login', {
      name: options.name,
      password: options.password,
    });
    return new SNFSSessionHttp(this, options.api_root, result.pool);
  }

  async resume(api_root: string, pool: string): Promise<SNFSSession> {
    const result = await apirequest(api_root + '/' + pool + '/resume', {
    });
    return new SNFSSessionHttp(this, api_root, pool);
  }
}

export class SNFSSessionHttp extends SNFSSession {
  _snfs: SNFSHttp;
  _api_root: string;
  _pool: string;

  constructor(snfs: SNFSHttp, api_root: string, pool: string) {
    super();

    this._snfs = snfs;
    this._api_root = api_root;
    this._pool = pool;
  }

  async logout(): Promise<void> {
    await apirequest(this._api_root + '/' + this._pool + '/logout', {
    });
  }

  async fs(): Promise<SNFSFileSystem> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/fs', {
    });
    return new SNFSFileSystemHttp(this._snfs, this._api_root, this._pool, result.fstoken, result.name, result.fsno, result.limits);
  }

  async useradd(options: SNFSUserOptions): Promise<SNFSUserInfo> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/useradd', {
      options,
    });
    return result;
  }

  async usermod(name: string, options: SNFSUserOptions): Promise<SNFSUserInfo> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/usermod', {
      name,
      options,
    });
    return result;
  }

  async userdel(name: string): Promise<void> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/userdel', {
      name,
    });
    return result;
  }

  async userlist(): Promise<SNFSUserInfo[]> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/userlist', {
    });
    return result;
  }

  async fsadd(options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/fsadd', {
      options,
    });
    return result;
  }

  async fsmod(fsno: string, options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/fsmod', {
      fsno,
      options,
    });
    return result;
  }

  async fsdel(fsno: string): Promise<void> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/fsdel', {
      fsno,
    });
    return result;
  }

  async fslist(): Promise<SNFSFileSystemInfo[]> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/fslist', {
    });
    return result;
  }

  async fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<SNFSFileSystem> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/fsget', {
      fsno,
      options,
    });
    return new SNFSFileSystemHttp(this._snfs, this._api_root, this._pool, result.fstoken, result.name, result.fsno, result.limits);
  }
}

export class SNFSFileSystemHttp extends SNFSFileSystem {
  _snfs: SNFSHttp;
  _api_root: string;
  _pool: string;
  _fstoken: string;

  constructor(snfs: SNFSHttp, api_root: string, pool: string, fstoken: string, name: string, fsno: string, limits: SNFSFileSystemLimits) {
    super(name, fsno, limits);

    this._snfs = snfs;
    this._api_root = api_root;
    this._pool = pool;
    this._fstoken = fstoken;
  }

  async readdir(path: string): Promise<SNFSReadDir[]> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/readdir', {
      fstoken: this._fstoken,
      path,
    });
    return result;
  }

  async stat(path: string): Promise<SNFSStat> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/stat', {
      fstoken: this._fstoken,
      path,
    });
    result.mtime = new Date(result.mtime);
    result.ctime = new Date(result.ctime);
    return result;
  }

  async writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/writefile', {
      fstoken: this._fstoken,
      path,
      data: bufferToBase64(data),
      options,
    });
    return result;
  }

  async readfile(path: string): Promise<SNFSReadFile> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/readfile', {
      fstoken: this._fstoken,
      path,
    });
    result.data = base64ToBuffer(result.data);
    return result;
  }

  async unlink(path: string): Promise<SNFSUnlink> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/unlink', {
      fstoken: this._fstoken,
      path,
    });
    return {};
  }

  async move(path: string, newpath: string): Promise<SNFSMove> {
    const result = await apirequest(this._api_root + '/' + this._pool + '/move', {
      fstoken: this._fstoken,
      path,
      newpath,
    });
    return {};
  }
}
