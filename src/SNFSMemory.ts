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
} from './SNFS';

const LIMITS = {
  max_files: 200,
  max_storage: 5 * 1024 * 1024,
  max_depth: 5,
  max_path: 256,
};

export abstract class SNFSPasswordModule {
  abstract hash(password: string): string;
  abstract check(password: string, hash: string): boolean;
}

export class SNFSPasswordModuleNull extends SNFSPasswordModule {
  hash(password: string): string {
    return password;
  }

  check(password: string, hash: string): boolean {
    return password === hash;
  }
}

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

function fileSystemOptionsToLimits(options: SNFSFileSystemOptions, fallback: SNFSFileSystemLimits): SNFSFileSystemLimits {
  const limits = {
    max_files: options.max_files,
    max_storage: options.max_storage,
    max_depth: options.max_depth,
    max_path: options.max_path,
  };
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
  _uuidgen: () => string;
  _password_module: SNFSPasswordModule;
  _fss: SNFSFileSystemMemory[];
  _users: UserRecord[];

  constructor(uuidgen: () => string, password_module: SNFSPasswordModule) {
    super();

    this._uuidgen = uuidgen;
    this._password_module = password_module;
    this._fss = [new SNFSFileSystemMemory('default', this._uuidgen(), LIMITS, this._uuidgen)];
    this._users = [{
      name: 'guest',
      password: this._password_module.hash(''),
      fs: this._fss[0],
      union: [],
    }];
  }

  login(options: SNFSAuthCredentialsMemory): Promise<SNFSSession> {
    let reject = false;
    let user = null;
    for (let i = 0; i < this._users.length; ++i) {
      if (this._users[i].name == options.name) {
        user = this._users[i];
      }
    }
    if (user == null) {
      user = this._users[0];
      reject = true;
    }
    const match = this._password_module.check(options.password, user.password);
    if (!match || reject) {
      throw new SNFSError('AUTHORIZATION_DENIED');
    }
    const session = new SNFSSessionMemory(this, user);
    return Promise.resolve(session);
  }
}

export class SNFSSessionMemory extends SNFSSession {
  _snfs: SNFSMemory;
  _logged_in_user: UserRecord;

  constructor(snfs: SNFSMemory, user: UserRecord) {
    super();

    this._snfs = snfs;
    this._logged_in_user = user;
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
    const writeable = true; // File system is writeable by virtue of being assigned the the user.
    return Promise.resolve(new SNFSFileSystemMemoryUnion(fs, this._logged_in_user.union, writeable, this._snfs._uuidgen));
  }

  useradd(options: SNFSUserOptions): Promise<SNFSUserInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    if (typeof options.name === 'undefined') {
      throw new SNFSError('Option `name` is required.');
    }
    if (typeof options.password === 'undefined') {
      throw new SNFSError('Option `password` is required.');
    }
    if (this._snfs._users.find(u => u.name == options.name)) {
      throw new SNFSError('User already exists.');
    }
    let fs = null;
    let union = [];
    if (typeof options.fs !== 'undefined') {
      fs = this._snfs._fss.find(f => f.fsno == options.fs);
      if (fs == null) {
        throw new SNFSError('FS not found.');
      }
    }
    if (typeof options.union !== 'undefined') {
      for (const ufsno of options.union) {
        const u = this._snfs._fss.find(f => f.fsno == ufsno);
        if (u == null) {
          throw new SNFSError('FS not found.');
        }
        union.push(u);
      }
    }
    const user = {
      name: options.name,
      password: this._snfs._password_module.hash(options.password),
      fs,
      union,
    };
    this._snfs._users.push(user);
    return Promise.resolve(userRecordToUserInfo(user));
  }

  usermod(name: string, options: SNFSUserOptions): Promise<SNFSUserInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const user = this._snfs._users.find(u => u.name == name);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    const new_user = { ...user };
    if (typeof options.name !== 'undefined' && options.name != name) {
      const existing = this._snfs._users.find(u => u.name == options.name);
      if (existing != null) {
        throw new SNFSError('User already exists.');
      }
      new_user.name = options.name;
    }
    if (typeof options.password !== 'undefined') {
      new_user.password = this._snfs._password_module.hash(options.password);
    }
    if (typeof options.fs !== 'undefined') {
      const fs = this._snfs._fss.find(f => f.fsno == options.fs);
      if (fs == null) {
        throw new SNFSError('FS not found.');
      }
      new_user.fs = fs;
    }
    if (typeof options.union !== 'undefined') {
      const union = [];
      for (const ufsno of options.union) {
        const u = this._snfs._fss.find(f => f.fsno == ufsno);
        if (u == null) {
          throw new SNFSError('FS not found.');
        }
        union.push(u);
      }
      new_user.union = union;
    }
    this._snfs._users = this._snfs._users.filter(u => u.name != name);
    this._snfs._users.push(new_user);
    if (user == this._logged_in_user) {
      this._logged_in_user = new_user;
    }
    return Promise.resolve(userRecordToUserInfo(new_user));
  }

  userdel(name: string): Promise<void> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    if (this._logged_in_user.name == name) {
      throw new SNFSError('Cannot delete logged in user.');
    }
    const user = this._snfs._users.find(u => u.name == name);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    this._snfs._users = this._snfs._users.filter(u => u.name != name);
    return Promise.resolve();
  }

  userlist(): Promise<SNFSUserInfo[]> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    return Promise.resolve(this._snfs._users.map(userRecordToUserInfo));
  }

  fsadd(options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    if (typeof options.name == 'undefined') {
      throw new SNFSError('Option `name` is required.');
    } else if (!options.name) {
      throw new SNFSError('Option `name` may not be blank.');
    }
    const limits = fileSystemOptionsToLimits(options, LIMITS);
    const fs = new SNFSFileSystemMemory(options.name, this._snfs._uuidgen(), limits, this._snfs._uuidgen);
    // TODO: Check for collision? Shouldn't need to.
    this._snfs._fss.push(fs);
    return Promise.resolve(fileSystemToInfo(fs));
  }

  fsmod(fsno: string, options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const fs = this._snfs._fss.find(f => f.fsno == fsno);
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

  fsdel(fsno: string): Promise<void> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    for (const user of this._snfs._users) {
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
    this._snfs._fss = this._snfs._fss.filter(x => x.fsno != fsno);
    return Promise.resolve();
  }

  fslist(): Promise<SNFSFileSystemInfo[]> {
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    return Promise.resolve(this._snfs._fss.map(fileSystemToInfo));
  }

  fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<SNFSFileSystem> {
    options = { ...options };
    if (typeof options.union == 'undefined') {
      options.union = [];
    }
    if (typeof options.writeable == 'undefined') {
      options.writeable = true;
    }
    if (this._logged_in_user == null) {
      throw new SNFSError('NOT_LOGGED_IN');
    }
    const fs = this._snfs._fss.find(fs => fs.fsno == fsno);
    if (fs == null) {
      throw new SNFSError('FS not found.');
    }
    const union = [];
    for (const ufsno of options.union) {
      const ufs = this._snfs._fss.find(fs => fs.fsno == ufsno);
      if (ufs == null) {
        throw new SNFSError('FS not found for union.');
      }
      union.push(ufs);
    }
    if (union.length == 0 && options.writeable) {
      return Promise.resolve(fs);
    }
    return Promise.resolve(new SNFSFileSystemMemoryUnion(fs, union, options.writeable, this._snfs._uuidgen));
  }
}

function pathisdir(path: string) {
  if (path.length == 0) {
    return true; // It's /
  }
  return path[path.length - 1] == '/';
}

// File or dir
function pathnormforfile(path: string) {
  if (path.length == 0) {
    throw new SNFSError('File must have a name.');
  }
  if (path[path.length - 1] == '/') {
    throw new SNFSError('File path may not end with /');
  }
  const parts = path.split('/');
  const bad = parts.find(x => x == '.' || x == '..');
  if (bad != null) {
    throw new SNFSError('. and .. are not valid in paths.');
  }
  return '/' + parts.filter(x => x != '').join('/');
}

function pathnormfordir(path: string) {
  if (path.length == 0) {
    return '/';
  }
  const parts = path.split('/');
  const bad = parts.find(x => x == '.' || x == '..');
  if (bad != null) {
    throw new SNFSError('. and .. are not valid in paths.');
  }
  path = '/' + parts.filter(x => x != '').join('/');
  if (path[path.length - 1] != '/')
    path += '/';
  return path;
}

export class SNFSFileSystemMemory extends SNFSFileSystem {
  _uuidgen: () => string;
  _files: Map<string, SNFSFileMemory>;

  constructor(name: string, fsno: string, limits: SNFSFileSystemLimits, uuidgen: () => string) {
    super(name, fsno, limits);

    this._uuidgen = uuidgen;
    this._files = new Map<string, SNFSFileMemory>();
  }

  readdir(path: string): Promise<SNFSReadDir[]> {
    path = pathnormfordir(path);
    // Use the fact that path ends with a / to help with the search for files.
    const result: SNFSReadDir[] = [];
    for (const [p, f] of this._files.entries()) {
      // e.g. path = '/some/place/' and p = '/some/place/to/call/home'
      if (p.indexOf(path) == 0) {
        const rest = p.slice(path.length);
        const restparts = rest.split('/');
        if (restparts.length == 0) {
          // Since no file ends with a '/', rest will be non-empty and the split will be non-empty.
          throw new SNFSError('Logical error.');
        } else if (restparts.length == 1) {
          // It's a file. There can be only one, so just add it without checking
          // for a duplicate.
          result.push({
            name: restparts[0],
            kind: SNFSNodeKind.File,
            ino: f.ino,
            ctime: f.ctime,
            mtime: f.mtime,
            size: f.data.length,
            writeable: true,
          });
        } else {
          // It's a directory. There may be more than one, so check for duplicates.
          const existing = result.find(r => r.name == restparts[0] && r.kind == SNFSNodeKind.Directory);
          if (existing == null) {
            result.push({
              name: restparts[0],
              kind: SNFSNodeKind.Directory,
              ino: null,
              ctime: null,
              mtime: null,
              size: null,
              writeable: null,
            });
          }
        }
      } // if (p.indexOf(path) == 0)
    } // for (const [p, f] ...
    result.sort((a, b) => {
      if (a.name != b.name)
        return a.name < b.name ? -1 : 1;
      if (a.kind != b.kind)
        return a.kind < b.kind ? -1 : 1;
      return 0;
    });
    return Promise.resolve(result);
  }

  stat(path: string): Promise<SNFSStat> {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    return Promise.resolve({
      name: path,
      kind: SNFSNodeKind.File,
      ino: f.ino,
      ctime: f.ctime,
      mtime: f.mtime,
      size: f.data.length,
      writeable: true, // Non-writeability is handled by SNFSFileSystemMemoryUnion
    });
  }

  writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    path = pathnormforfile(path);
    let f: SNFSFileMemory = this._files.get(path);
    if (f == null || !options.truncate) {
      f = new SNFSFileMemory();
      f.name = path;
      f.ino = this._uuidgen();
      f.ctime = new Date();
      f.mtime = new Date();
      f.data = data.slice();
      this._files.set(path, f);
    } else {
      f.data = data.slice();
      f.mtime = new Date();
    }
    return Promise.resolve({
      ino: f.ino,
    });
  }

  readfile(path: string): Promise<SNFSReadFile> {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    return Promise.resolve({
      data: f.data.slice(),
    });
  }

  unlink(path: string): Promise<SNFSUnlink> {
    path = pathnormforfile(path);
    if (!this._files.delete(path)) {
      throw new SNFSError('File not found.');
    }
    return Promise.resolve({
    });
  }

  move(path: string, newpath: string): Promise<SNFSMove> {
    path = pathnormforfile(path);
    newpath = pathnormforfile(newpath);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    this._files.delete(path);
    // This deletes the file at newpath if there is one present.
    this._files.set(newpath, f);
    f.name = newpath;
    return Promise.resolve({
    });
  }
}

class SNFSFileSystemMemoryUnion extends SNFSFileSystemMemory {
  _fs: SNFSFileSystemMemory;
  _union: SNFSFileSystemMemory[];
  _writeable: boolean;

  constructor(fs: SNFSFileSystemMemory, union: SNFSFileSystemMemory[], writeable: boolean, uuidgen: () => string) {
    super(fs.name, fs.fsno, fs.limits, uuidgen);

    this._fs = fs;
    this._union = union.slice();
    this._writeable = writeable;
  }

  async readdir(path: string): Promise<SNFSReadDir[]> {
    const result = await this._fs.readdir(path);
    if (!this._writeable) {
      for (const f of result) {
        f.writeable = false;
      }
    }
    for (const fs of this._union) {
      const more = await fs.readdir(path);
      for (const r of more) {
        const existing = result.find(e => e.name == r.name && e.kind == r.kind);
        if (existing == null) {
          r.writeable = false;
          result.push(r);
        }
      }
    }
    result.sort((a, b) => {
      if (a.name != b.name)
        return a.name < b.name ? -1 : 1;
      if (a.kind != b.kind)
        return a.kind < b.kind ? -1 : 1;
      return 0;
    });
    return result;
  }

  async stat(path: string): Promise<SNFSStat> {
    const errors = [];
    for (const fs of [this._fs, ...this._union]) {
      try {
        const result = await fs.stat(path);
        // TODO: Not my favorite code, using errors as a counter.
        if (errors.length > 0 || !this._writeable) {
          result.writeable = false;
        }
        return result;
      } catch(err) {
        if (err instanceof SNFSError) {
          errors.push(err);
        } else {
          throw err;
        }
      }
    }
    throw errors[0];
  }

  async writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    return await this._fs.writefile(path, data, options);
  }

  async readfile(path: string): Promise<SNFSReadFile> {
    const errors = [];
    for (const fs of [this._fs, ...this._union]) {
      try {
        return await fs.readfile(path);
      } catch(err) {
        if (err instanceof SNFSError) {
          errors.push(err);
        } else {
          throw err;
        }
      }
    }
    throw errors[0]; // Maybe this isn't a great idea? It'll have the original stack trace.
  }

  async unlink(path: string): Promise<SNFSUnlink> {
    // It would be nice if this happened only if the file exists.
    // Could do it by doing stat() first, but it's not time to
    // make everything perfect yet.
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    // We'll defer the unlink error and throw if if none of the unioned fs's
    // have the file. Otherwise we'll throw a permission denied.
    let error = null;
    try {
      return await this._fs.unlink(path);
    } catch (err) {
      if (err instanceof SNFSError) {
        error = err;
      } else {
        throw err;
      }
    }
    for (const fs of this._union) {
      let dothrow = false;
      try {
        await fs.stat(path);
        dothrow = true;
      } catch (err) {
        if (err instanceof SNFSError) {
          // File not found error expected.
        } else {
          throw err;
        }
      }
      if (dothrow) {
        throw new SNFSError('Cannot unlink from unioned FS.');
      }
    }
    throw error;
  }

  async move(path: string, newpath: string): Promise<SNFSMove> {
    // It would be nice if this happened only if the file exists.
    // Could do it by doing stat() first, but it's not time to
    // make everything perfect yet.
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    let error = null;
    try {
      return await this._fs.move(path, newpath);
    } catch (err) {
      if (err instanceof SNFSError) {
        error = err;
      } else {
        throw err;
      }
    }
    for (const fs of this._union) {
      let dothrow = false;
      try {
        await fs.stat(path);
        dothrow = true;
      } catch (err) {
        if (err instanceof SNFSError) {
          // Intentionally blank.
        } else {
          throw err;
        }
      }
      if (dothrow) {
        throw new SNFSError('Cannot move from unioned FS.');
      }
    }
    throw error;
  }
}

export interface SNFSAuthCredentialsMemory extends SNFSAuthCredentials {
  name: string;
  password: string;
}

export interface UserRecord {
  name: string;
  password: string;
  fs: SNFSFileSystemMemory;
  union: SNFSFileSystemMemory[];
}

export class SNFSFileMemory {
  name: string;
  ino: string;
  ctime: Date;
  mtime: Date;
  data: Uint8Array;
}
