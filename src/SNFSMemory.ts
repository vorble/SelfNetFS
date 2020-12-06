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
  SNFSReadDir,
  SNFSReadFile,
  SNFSStat,
  SNFSUnlink,
  SNFSUserInfo,
  SNFSUserOptions,
  SNFSWriteFile,
  SNFSWriteFileOptions,
} from './SNFS';
import { uuidgen } from './uuid';

const LIMITS = {
  max_files: 200,
  max_storage: 5 * 1024 * 1024,
  max_depth: 5,
  max_path: 256,
};

function userRecordToUserInfo(user: UserRecord): SNFSUserInfo {
  return {
    name: user.name,
    fs: user.fs == null ? null : {
      name: user.fs.name,
      fsno: user.fs.fsno,
      writeable: true,
    },
    union: user.union.map(f => {
      return {
        name: f.name,
        fsno: f.fsno,
        writeable: false,
      };
    }),
  };
}

function fileSystemOptionsToLimits(options: SNFSFileSystemOptions, fallback?: SNFSFileSystemLimits): SNFSFileSystemLimits {
  const limits = {
    max_files: options.max_files,
    max_storage: options.max_storage,
    max_depth: options.max_depth,
    max_path: options.max_path,
  };
  if (fallback == null) {
    fallback = LIMITS;
  }
  if (typeof limits.max_files == 'undefined') {
    limits.max_files = fallback.max_files;
  } else if (limits.max_files < 0) {
    throw new SNFSError('Option `max_files` out of bounds.');
  } else if (Number.isNaN(limits.max_files) || !Number.isFinite(limits.max_files)) {
    throw new SNFSError('Option `max_files` out of bounds.');
  }
  if (typeof limits.max_storage == 'undefined') {
    limits.max_storage = fallback.max_storage;
  } else if (limits.max_storage < 0) {
    throw new SNFSError('Option `max_storage` out of bounds.');
  } else if (Number.isNaN(limits.max_storage) || !Number.isFinite(limits.max_storage)) {
    throw new SNFSError('Option `max_storage` out of bounds.');
  }
  if (typeof limits.max_depth == 'undefined') {
    limits.max_depth = fallback.max_depth;
  } else if (limits.max_depth < 0) {
    throw new SNFSError('Option `max_depth` out of bounds.');
  } else if (Number.isNaN(limits.max_depth) || !Number.isFinite(limits.max_depth)) {
    throw new SNFSError('Option `max_depth` out of bounds.');
  }
  if (typeof limits.max_path == 'undefined') {
    limits.max_path = fallback.max_path;
  } else if (limits.max_path < 0) {
    throw new SNFSError('Option `max_path` out of bounds.');
  } else if (Number.isNaN(limits.max_path) || !Number.isFinite(limits.max_path)) {
    throw new SNFSError('Option `max_path` out of bounds.');
  }
  return limits;
}

function fileSystemToInfo(fs: SNFSFileSystemMemory): SNFSFileSystemInfo {
  return {
    name: fs.name,
    fsno: fs.fsno,
    limits: fs.limits,
  };
}

export class SNFSMemory extends SNFS {
  _fss: SNFSFileSystemMemory[];
  _logged_in_user: UserRecord;
  _users: UserRecord[];

  constructor() {
    super();

    this._fss = [new SNFSFileSystemMemory('default', uuidgen(), LIMITS)];
    this._logged_in_user = null;
    this._users = [{
      name: 'guest',
      password: '',
      fs: this._fss[0],
      union: [],
    }];
  }

  login(options: SNFSAuthCredentialsMemory): Promise<void> {
    const user = this._users.find(u => u.name == options.name && u.password == options.password);
    if (user == null) {
      throw new SNFSError('AUTHORIZATION_DENIED');
    }
    this._logged_in_user = user;
    return Promise.resolve();
  }

  logout(): Promise<void> {
    this._logged_in_user = null;
    return Promise.resolve();
  }

  fs(): Promise<SNFSFileSystem> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const fs = this._logged_in_user.fs;
    if (fs == null) {
      throw new SNFSError('NO_FS');
    }
    return Promise.resolve(new SNFSFileSystemMemoryUnion(fs, this._logged_in_user.union));
  }

  async useradd(options: SNFSUserOptions): Promise<SNFSUserInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    if (typeof options.name === 'undefined') {
      throw new SNFSError('Option `name` is required.');
    }
    if (typeof options.password === 'undefined') {
      throw new SNFSError('Option `password` is required.');
    }
    if (this._users.find(u => u.name == options.name)) {
      throw new SNFSError('User already exists.');
    }
    let fs = null;
    let union = [];
    if (typeof options.fs !== 'undefined') {
      fs = this._fss.find(f => f.fsno == options.fs);
      if (fs == null) {
        throw new SNFSError('FS not found.');
      }
    }
    if (typeof options.union !== 'undefined') {
      for (const ufsno of options.union) {
        const u = this._fss.find(f => f.fsno == ufsno);
        if (u == null) {
          throw new SNFSError('FS not found.');
        }
        union.push(u);
      }
    }
    const user = {
      name: options.name,
      password: options.password,
      fs,
      union,
    };
    this._users.push(user);
    return userRecordToUserInfo(user);
  }

  async usermod(name: string, options: SNFSUserOptions): Promise<SNFSUserInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const user = this._users.find(u => u.name == name);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    const new_user = { ...user };
    if (typeof options.name !== 'undefined' && options.name != name) {
      const existing = this._users.find(u => u.name == options.name);
      if (existing != null) {
        throw new SNFSError('User already exists.');
      }
      new_user.name = options.name;
    }
    if (typeof options.password !== 'undefined') {
      new_user.password = options.password;
    }
    if (typeof options.fs !== 'undefined') {
      const fs = this._fss.find(f => f.fsno == options.fs);
      if (fs == null) {
        throw new SNFSError('FS not found.');
      }
      new_user.fs = fs;
    }
    if (typeof options.union !== 'undefined') {
      const union = [];
      for (const ufsno of options.union) {
        const u = this._fss.find(f => f.fsno == ufsno);
        if (u == null) {
          throw new SNFSError('FS not found.');
        }
        union.push(u);
      }
      new_user.union = union;
    }
    this._users = this._users.filter(u => u.name != name);
    this._users.push(new_user);
    return Promise.resolve(userRecordToUserInfo(new_user));
  }

  async userdel(name: string): Promise<void> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    if (this._logged_in_user.name == name) {
      throw new SNFSError('Cannot delete logged in user.');
    }
    const user = this._users.find(u => u.name == name);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    this._users = this._users.filter(u => u.name != name);
    return Promise.resolve();
  }

  userlist(): Promise<SNFSUserInfo[]> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    return Promise.resolve(this._users.map(userRecordToUserInfo));
  }

  async fsadd(options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    if (typeof options.name == 'undefined') {
      throw new SNFSError('Option `name` is required.');
    } else if (!options.name) {
      throw new SNFSError('Option `name` may not be blank.');
    }
    const limits = fileSystemOptionsToLimits(options, LIMITS);
    const fs = new SNFSFileSystemMemory(options.name, uuidgen(), limits);
    // TODO: Check for collision?
    this._fss.push(fs);
    return Promise.resolve(fileSystemToInfo(fs));
  }

  async fsmod(fsno: string, options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const fs = this._fss.find(f => f.fsno == fsno);
    if (typeof options.name == 'undefined') {
    } else if (!options.name) {
      throw new SNFSError('Option `name` may not be blank.');
    } else {
      fs.name = options.name;
    }
    const limits = fileSystemOptionsToLimits(options, fs.limits);
    fs.limits = limits;
    return Promise.resolve(fileSystemToInfo(fs));
  }

  async fsdel(fsno: string): Promise<void> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    for (const user of this._users) {
      if (user.fs) {
        if (user.fs.fsno == fsno) {
          throw new SNFSError('FS still assigned to user.');
        }
      }
      for (const ufs of user.union) {
        if (ufs.fsno == fsno) {
          throw new SNFSError('FS still assigned to user.');
        }
      }
    }
    this._fss = this._fss.filter(x => x.fsno != fsno);
    return Promise.resolve();
  }

  async fslist(): Promise<SNFSFileSystemInfo[]> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    return Promise.resolve(this._fss.map(fileSystemToInfo));
  }

  async fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<SNFSFileSystem> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const fs = this._fss.find(fs => fs.fsno == fsno);
    if (fs == null) {
      throw new SNFSError('FS not found.');
    }
    return fs;
  }
}

export class SNFSFileSystemMemory extends SNFSFileSystem {
  constructor(name: string, fsno: string, limits: SNFSFileSystemLimits) {
    super(name, fsno, limits);
  }

  async readdir(path: string): Promise<SNFSReadDir[]> {
    throw new SNFSError('Not implemented.');
  }

  async stat(path: string): Promise<SNFSStat> {
    throw new SNFSError('Not implemented.');
  }

  async writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    throw new SNFSError('Not implemented.');
  }

  async readfile(path: string): Promise<SNFSReadFile> {
    throw new SNFSError('Not implemented.');
  }

  async unlink(path: string): Promise<SNFSUnlink> {
    throw new SNFSError('Not implemented.');
  }

  async move(path: string, newpath: string): Promise<SNFSMove> {
    throw new SNFSError('Not implemented.');
  }
}

class SNFSFileSystemMemoryUnion extends SNFSFileSystemMemory {
  _fs: SNFSFileSystemMemory;
  _union: SNFSFileSystemMemory[];

  constructor(fs: SNFSFileSystemMemory, union: SNFSFileSystemMemory[]) {
    super(fs.name, fs.fsno, fs.limits);

    this._fs = fs;
    this._union = union.slice();
  }

  async readdir(path: string): Promise<SNFSReadDir[]> {
    throw new SNFSError('Not implemented.');
  }

  async stat(path: string): Promise<SNFSStat> {
    throw new SNFSError('Not implemented.');
  }

  writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    throw new SNFSError('Not implemented.');
  }

  async readfile(path: string): Promise<SNFSReadFile> {
    throw new SNFSError('Not implemented.');
  }

  async unlink(path: string): Promise<SNFSUnlink> {
    throw new SNFSError('Not implemented.');
  }

  async move(path: string, newpath: string): Promise<SNFSMove> {
    throw new SNFSError('Not implemented.');
  }
}

export interface SNFSAuthCredentialsMemory extends SNFSAuthCredentials {
  name: string;
  password: string;
}

interface UserRecord {
  name: string;
  password: string;
  fs: SNFSFileSystemMemory;
  union: SNFSFileSystemMemory[];
}
