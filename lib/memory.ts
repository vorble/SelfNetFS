import {
  FsaddOptions,
  FsmodOptions,
  UseraddOptions,
  UsermodOptions,
  SNFS,
  SNFSError,
  SNFSFileSystem,
  SNFSFileSystemDel,
  FileSystemDetail,
  FsgetOptions,
  FSInfo,
  SNFSFileSystemLimits,
  SNFSFileSystemSessionDetail,
  FileSystemInfo,
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
} from './snfs';
import {
  SNFSPasswordModule,
  SNFSPasswordModuleNull,
} from './password';

const LIMITS = {
  max_files: 200,
  max_storage: 5 * 1024 * 1024,
  max_depth: 5,
  max_path: 256,
};

function uuidgen_unique(uuidgen: () => string, isduplicate: (arg0: string) => boolean): string {
  let times = 4;
  while (times-- > 0) {
    const value = uuidgen();
    if (!isduplicate(value)) {
      return value;
    }
  }
  throw new SNFSError('Too many UUID collissions.');
}

function userRecordToUserInfo(user: UserRecord): UserInfo {
  return {
    userno: user.userno,
    name: user.name,
    admin: user.admin,
    fs: user.fs == null ? null : {
      name: user.fs._name,
      fsno: user.fs._fsno,
      writeable: true,
    },
    union: user.union.map(f => {
      return {
        name: f._name,
        fsno: f._fsno,
        writeable: false,
      };
    }),
  };
}

function fileSystemOptionsToLimits(options: FsmodOptions | FsaddOptions, fallback: SNFSFileSystemLimits): SNFSFileSystemLimits {
  const limits = { ...fallback };
  if (typeof options.max_files !== 'undefined') {
    if (options.max_files < 0) {
      throw new SNFSError('Option `max_files` out of bounds.');
    } else if (Number.isNaN(options.max_files) || !Number.isFinite(options.max_files)) {
      throw new SNFSError('Option `max_files` out of bounds.');
    }
    limits.max_files = options.max_files;
  }
  if (typeof options.max_storage !== 'undefined') {
    if (options.max_storage < 0) {
      throw new SNFSError('Option `max_storage` out of bounds.');
    } else if (Number.isNaN(options.max_storage) || !Number.isFinite(options.max_storage)) {
      throw new SNFSError('Option `max_storage` out of bounds.');
    }
    limits.max_storage = options.max_storage;
  }
  if (typeof options.max_depth !== 'undefined') {
    if (options.max_depth < 0) {
      throw new SNFSError('Option `max_depth` out of bounds.');
    } else if (Number.isNaN(options.max_depth) || !Number.isFinite(options.max_depth)) {
      throw new SNFSError('Option `max_depth` out of bounds.');
    }
    limits.max_depth = options.max_depth;
  }
  if (typeof options.max_path !== 'undefined') {
    if (options.max_path < 0) {
      throw new SNFSError('Option `max_path` out of bounds.');
    } else if (Number.isNaN(options.max_path) || !Number.isFinite(options.max_path)) {
      throw new SNFSError('Option `max_path` out of bounds.');
    }
    limits.max_path = options.max_path;
  }
  return limits;
}

function fileSystemToInfo(fs: SNFSFileSystemMemory): FSInfo {
  return {
    name: fs._name,
    fsno: fs._fsno,
    limits: { ...fs._limits },
  };
}

function fileSystemToDetail(fs: SNFSFileSystemMemory): FileSystemDetail {
  return {
    name: fs._name,
    fsno: fs._fsno,
    limits: { ...fs._limits },
    usage: {
      no_files: fs._files.size,
      bytes_used: fs._stored_bytes,
    },
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
    this._fss = [];
    this._users = [];
  }

  _uuidgen_unique_fsno(): string {
    return uuidgen_unique(this._uuidgen,
      (fsno: string) => this._fss.find(fs => fs._fsno == fsno) != null);
  }

  _uuidgen_unique_userno(): string {
    return uuidgen_unique(this._uuidgen,
      (userno: string) => this._users.find(user => user.userno == userno) != null);
  }

  // just for in-memory implementation.
  bootstrap(name: string, password: string): void {
    if (this._fss.length != 0 || this._users.length != 0) {
      throw new SNFSError('Too late to bootstrap.');
    }
    const fs = new SNFSFileSystemMemory('default', this._uuidgen_unique_fsno(), LIMITS, this._uuidgen);
    const user = {
      userno: this._uuidgen_unique_userno(),
      name: name,
      admin: true,
      password: this._password_module.hash(password),
      fs: fs,
      union: [],
    };
    this._fss.push(fs);
    this._users.push(user);
  }

  _lookup_user(userno: string): UserRecord | null {
    return this._users.find(u => u.userno == userno) || null;
  }

  login(options: LoginOptionsMemory): Promise<SNFSSession> {
    let reject = false;
    let user = null;
    for (let i = 0; i < this._users.length; ++i) {
      if (this._users[i].name == options.name) {
        user = this._users[i];
      }
    }
    if (user == null) {
      user = this._users[0] || { password: '' };
      reject = true;
    }
    const match = this._password_module.check(options.password, user.password);
    if (!match || reject) {
      throw new SNFSError('Authentication failed.');
    }
    const session = new SNFSSessionMemory(this, user);
    return Promise.resolve(session);
  }

  _resume(session_token: string): SNFSSession {
    const user = this._users.find(u => u.userno == session_token);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    const session = new SNFSSessionMemory(this, user);
    return session;
  }

  resume(session_token: string): Promise<SNFSSession> {
    return Promise.resolve(this._resume(session_token));
  }
}

export class SNFSSessionMemory extends SNFSSession {
  _snfs: SNFSMemory;
  _session_token: string;
  _logged_in_userno: string | null;

  constructor(snfs: SNFSMemory, user: UserRecord) {
    super();

    this._snfs = snfs;
    this._session_token = user.userno;
    this._logged_in_userno = user.userno;
  }

  _lookup_user(): UserRecord {
    if (this._logged_in_userno == null) {
      throw new SNFSError('Not logged in.');
    }
    const logged_in_user = this._snfs._lookup_user(this._logged_in_userno);
    if (logged_in_user == null) {
      throw new SNFSError('User not found.');
    }
    return logged_in_user;
  }

  info(): SessionInfo {
    if (this._logged_in_userno == null) {
      throw new SNFSError('Not logged in.');
    }
    return {
      session_token: this._session_token,
      userno: this._logged_in_userno,
    };
  }

  detail(): Promise<SessionDetail> {
    const user = this._lookup_user();
    return Promise.resolve({
      session_token: this._session_token,
      user: userRecordToUserInfo(user),
    });
  }

  logout(): Promise<SNFSLogout> {
    this._logged_in_userno = null;
    return Promise.resolve({});
  }

  useradd(options: UseraddOptions): Promise<UserInfo> {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
    if (this._snfs._users.find(u => u.name == options.name)) {
      throw new SNFSError('User already exists.');
    }
    let fs = null;
    let union = [];
    let admin = false;
    let seen_fsnos = [];
    if (typeof options.fs !== 'undefined') {
      if (options.fs == null) {
        fs = null;
      } else {
        fs = this._snfs._fss.find(f => f._fsno == options.fs);
        if (fs == null) {
          throw new SNFSError('FS not found.');
        }
        seen_fsnos.push(fs._fsno);
      }
    }
    if (typeof options.union !== 'undefined') {
      for (const ufsno of options.union) {
        const u = this._snfs._fss.find(f => f._fsno == ufsno);
        if (u == null) {
          throw new SNFSError('FS not found.');
        }
        if (seen_fsnos.indexOf(u._fsno) >= 0) {
          throw new SNFSError('Duplicate fs in union.');
        }
        seen_fsnos.push(u._fsno);
        union.push(u);
      }
    }
    if (typeof options.admin !== 'undefined') {
      admin = options.admin;
    }
    const user = {
      userno: this._snfs._uuidgen_unique_userno(),
      name: options.name,
      admin: admin,
      password: this._snfs._password_module.hash(options.password),
      fs,
      union,
    };
    this._snfs._users.push(user);
    return Promise.resolve(userRecordToUserInfo(user));
  }

  usermod(userno: string, options: UsermodOptions): Promise<UserInfo> {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
    const user = this._snfs._users.find(u => u.userno == userno);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    const new_user = { ...user };
    if (typeof options.name !== 'undefined' && options.name != user.name) {
      const existing = this._snfs._users.find(u => u.name == options.name);
      if (existing != null) {
        throw new SNFSError('User already exists.');
      }
      new_user.name = options.name;
    }
    if (typeof options.password !== 'undefined') {
      new_user.password = this._snfs._password_module.hash(options.password);
    }
    if (typeof options.admin !== 'undefined') {
      new_user.admin = options.admin;
    }
    const seen_fsnos = [];
    if (typeof options.fs !== 'undefined') {
      if (options.fs == null) {
        new_user.fs = null;
      } else {
        const fs = this._snfs._fss.find(f => f._fsno == options.fs);
        if (fs == null) {
          throw new SNFSError('FS not found.');
        }
        seen_fsnos.push(fs._fsno);
        new_user.fs = fs;
      }
    }
    if (typeof options.union !== 'undefined') {
      const union = [];
      for (const ufsno of options.union) {
        const u = this._snfs._fss.find(f => f._fsno == ufsno);
        if (u == null) {
          throw new SNFSError('FS not found.');
        }
        if (seen_fsnos.indexOf(u._fsno) >= 0) {
          throw new SNFSError('Duplicate fs in union.');
        }
        seen_fsnos.push(u._fsno);
        union.push(u);
      }
      new_user.union = union;
    }
    this._snfs._users = this._snfs._users.filter(u => u.userno != userno);
    this._snfs._users.push(new_user);
    return Promise.resolve(userRecordToUserInfo(new_user));
  }

  userdel(userno: string): Promise<UserdelResult> {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
    if (logged_in_user.userno == userno) {
      throw new SNFSError('Cannot delete logged in user.');
    }
    const user = this._snfs._users.find(u => u.userno == userno);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    this._snfs._users = this._snfs._users.filter(u => u.userno != userno);
    return Promise.resolve({});
  }

  userlist(): Promise<UserInfo[]> {
    const logged_in_user = this._lookup_user();
    if (logged_in_user.admin) {
      return Promise.resolve(this._snfs._users.map(userRecordToUserInfo));
    } else {
      return Promise.resolve([userRecordToUserInfo(logged_in_user)]);
    }
  }

  fs(): Promise<SNFSFileSystem> {
    const logged_in_user = this._lookup_user();
    const fs = logged_in_user.fs;
    if (fs == null) {
      throw new SNFSError('User has no FS.');
    }
    const writeable = true; // File system is writeable by virtue of being assigned the the user.
    return Promise.resolve(new SNFSFileSystemMemoryUnion(fs, logged_in_user.union, writeable, this._snfs._uuidgen, logged_in_user, this._snfs));
  }

  fsget(fsno: string, options?: FsgetOptions): Promise<SNFSFileSystem> {
    options = { ...options };
    if (options.union == null) {
      options.union = [];
    }
    if (options.writeable == null) {
      options.writeable = true;
    }
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      const fsnos = [fsno, ...options.union];
      for (const fsno of fsnos) {
        if (fsno != (logged_in_user.fs || {})._fsno
            && null == logged_in_user.union.find(ufs => ufs._fsno == fsno)) {
            throw new SNFSError('Access denied.');
        }
      }
      if (null != logged_in_user.union.find(ufs => ufs._fsno == fsno)) {
        options.writeable = false;
      }
    }
    const fs = this._snfs._fss.find(fs => fs._fsno == fsno);
    if (fs == null) {
      throw new SNFSError('FS not found.');
    }
    const union = [];
    for (const ufsno of options.union) {
      const ufs = this._snfs._fss.find(fs => fs._fsno == ufsno);
      if (ufs == null) {
        throw new SNFSError('FS not found for union.');
      }
      union.push(ufs);
    }
    return Promise.resolve(new SNFSFileSystemMemoryUnion(fs, union, options.writeable, this._snfs._uuidgen, logged_in_user, this._snfs));
  }

  fsresume(fs_token: string): Promise<SNFSFileSystem> {
    let tok = null;
    try {
      tok = JSON.parse(fs_token);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new SNFSError('Invalid token.');
      }
      throw err;
    }
    const { fsno, union, writeable } = tok;
    if (typeof fsno !== 'string') {
      throw new SNFSError('Invalid token.');
    }
    if (!Array.isArray(union)) {
      throw new SNFSError('Invalid token.');
    }
    for (const ufsno of union) {
      if (typeof ufsno !== 'string') {
        throw new SNFSError('Invalid token.');
      }
    }
    if (typeof writeable !== 'boolean') {
      throw new SNFSError('Invalid token.');
    }
    return this.fsget(fsno, { union, writeable });
  }

  fsadd(options: FsaddOptions): Promise<FSInfo> {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
    if (!options.name) {
      throw new SNFSError('Option `name` may not be blank.');
    }
    const limits = fileSystemOptionsToLimits(options, LIMITS);
    let fsno = this._snfs._uuidgen_unique_fsno();
    const fs = new SNFSFileSystemMemory(options.name, fsno, limits, this._snfs._uuidgen);
    this._snfs._fss.push(fs);
    return Promise.resolve(fileSystemToInfo(fs));
  }

  fsmod(fsno: string, options: FsmodOptions): Promise<FSInfo> {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
    const fs = this._snfs._fss.find(f => f._fsno == fsno);
    if (fs == null) {
      throw new SNFSError('File system not found.');
    }
    let use_name = fs._name;
    if (typeof options.name === 'undefined') {
      // Intentionally blank.
    } else if (!options.name) {
      throw new SNFSError('Option `name` may not be blank.');
    } else {
      use_name = options.name;
    }
    const limits = fileSystemOptionsToLimits(options, fs._limits);
    fs._limits = limits;
    fs._name = use_name;
    return Promise.resolve(fileSystemToInfo(fs));
  }

  fsdel(fsno: string): Promise<SNFSFileSystemDel> {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
    for (const user of this._snfs._users) {
      if (user.fs) {
        if (user.fs._fsno == fsno) {
          throw new SNFSError('FS still assigned to user.');
        }
      }
      for (const ufs of user.union) {
        if (ufs._fsno == fsno) {
          throw new SNFSError('FS still assigned to user.');
        }
      }
    }
    const fs = this._snfs._fss.find(x => x._fsno == fsno);
    if (fs == null) {
      throw new SNFSError('File system not found.');
    }
    this._snfs._fss = this._snfs._fss.filter(x => x._fsno != fsno);
    return Promise.resolve({});
  }

  fslist(): Promise<FSInfo[]> {
    const logged_in_user = this._lookup_user();
    if (logged_in_user.admin) {
      return Promise.resolve(this._snfs._fss.map(fileSystemToInfo));
    } else {
      const result = [
        ...logged_in_user.union,
      ].map(fileSystemToInfo);
      if (logged_in_user.fs != null) {
        result.unshift(fileSystemToInfo(logged_in_user.fs));
      }
      return Promise.resolve(result);
    }
  }
}

// Path is for file or dir.
function pathnormforfile(path: string) {
  if (path.length == 0) {
    throw new SNFSError('File must have a name.');
  }
  if (path[path.length - 1] == '/') {
    throw new SNFSError('File path may not end with /.');
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
  _name: string;
  _fsno: string;
  _limits: SNFSFileSystemLimits;
  _uuidgen: () => string;
  _files: Map<string, SNFSFileMemory>;
  _stored_bytes: number;

  constructor(name: string, fsno: string, limits: SNFSFileSystemLimits, uuidgen: () => string) {
    super();

    this._name = name;
    this._fsno = fsno;
    this._limits = limits;
    this._uuidgen = uuidgen;
    this._files = new Map<string, SNFSFileMemory>();
    this._stored_bytes = 0;
  }

  _uuidgen_unique_ino(): string {
    return uuidgen_unique(this._uuidgen, (ino: string) => {
      for (const f of this._files.values()) {
        if (f.ino === ino) {
          return true;
        }
      }
      return false;
    });
  }

  info(): FileSystemInfo {
    return {
      fs_token: JSON.stringify({ fsno: this._fsno, union: [], writeable: true }),
      fsno: this._fsno,
      union: [],
    };
  }

  detail(): Promise<SNFSFileSystemSessionDetail> {
    return Promise.resolve({
      fs_token: JSON.stringify({ fsno: this._fsno, union: [], writeable: true }),
      fs: fileSystemToDetail(this),
      union: [],
    });
  }

  _readdir(path: string): SNFSReadDir[] {
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
    return result;
  }

  readdir(path: string): Promise<SNFSReadDir[]> {
    return Promise.resolve(this._readdir(path));
  }

  _stat(path: string): SNFSStat {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    return {
      name: path,
      kind: SNFSNodeKind.File,
      ino: f.ino,
      ctime: f.ctime,
      mtime: f.mtime,
      size: f.data.length,
      writeable: true, // Non-writeability is handled by SNFSFileSystemMemoryUnion
    };
  }

  stat(path: string): Promise<SNFSStat> {
    return Promise.resolve(this._stat(path));
  }

  _writefile(path: string, data: Uint8Array, options?: SNFSWriteFileOptions): SNFSWriteFile {
    options = { ...options };
    path = pathnormforfile(path);
    if (path.length > this._limits.max_path) {
      throw new SNFSError('max_path exceeded.');
    }
    if (path.split('/').length - 1 > this._limits.max_depth) {
      throw new SNFSError('max_depth exceeded.');
    }
    let f = this._files.get(path);
    // default truncate is false.
    let truncate = options.truncate == null ? false : options.truncate;
    if (f == null || !truncate) {
      let delta_bytes = 0;
      if (f != null) {
        delta_bytes -= f.data.length;
      }
      delta_bytes += data.length;
      if (delta_bytes + this._stored_bytes > this._limits.max_storage) {
        throw new SNFSError('max_storage exceeded.');
      }
      if (f == null && this._files.size + 1 > this._limits.max_files) {
        throw new SNFSError('max_files exceeded.');
      }
      f = {
        name: path,
        ino: this._uuidgen_unique_ino(),
        ctime: new Date(),
        mtime: new Date(),
        data: data.slice(),
      };
      this._files.set(path, f);
      this._stored_bytes += delta_bytes;
    } else {
      let delta_bytes = data.length - f.data.length;
      if (delta_bytes + this._stored_bytes > this._limits.max_storage) {
        throw new SNFSError('max_storage exceeded.');
      }
      f.data = data.slice();
      f.mtime = new Date();
      this._stored_bytes += delta_bytes;
    }
    return {
      ino: f.ino,
    };
  }

  writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    return Promise.resolve(this._writefile(path, data, options));
  }

  _readfile(path: string): SNFSReadFile {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    return {
      data: f.data.slice(),
    };
  }

  readfile(path: string): Promise<SNFSReadFile> {
    return Promise.resolve(this._readfile(path));
  }

  _unlink(path: string): SNFSUnlink {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    this._files.delete(path);
    this._stored_bytes -= f.data.length;
    return {
    };
  }

  unlink(path: string): Promise<SNFSUnlink> {
    return Promise.resolve(this._unlink(path));
  }

  _move(path: string, newpath: string): SNFSMove {
    path = pathnormforfile(path);
    newpath = pathnormforfile(newpath);
    if (newpath.length > this._limits.max_path) {
      throw new SNFSError('max_path exceeded.');
    }
    if (newpath.split('/').length - 1 > this._limits.max_depth) {
      throw new SNFSError('max_depth exceeded.');
    }
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    this._files.delete(path);
    this._stored_bytes -= f.data.length;
    const todel = this._files.get(newpath);
    // This deletes the file at newpath if there is one present.
    this._files.set(newpath, f);
    if (todel != null) {
      this._stored_bytes -= todel.data.length;
    }
    this._stored_bytes += f.data.length;
    f.name = newpath;
    return {};
  }

  move(path: string, newpath: string): Promise<SNFSMove> {
    return Promise.resolve(this._move(path, newpath));
  }
}

class SNFSFileSystemMemoryUnion extends SNFSFileSystemMemory {
  _fs: SNFSFileSystemMemory;
  _union: SNFSFileSystemMemory[];
  _writeable: boolean;
  _userno: string;
  _snfs: SNFSMemory;

  constructor(fs: SNFSFileSystemMemory, union: SNFSFileSystemMemory[], writeable: boolean, uuidgen: () => string, user: UserRecord, snfs: SNFSMemory) {
    super(fs._name, fs._fsno, fs._limits, uuidgen);

    this._fs = fs;
    this._union = union.slice();
    this._writeable = writeable;
    this._userno = user.userno;
    this._snfs = snfs;
  }

  _lookup_user(): UserRecord {
    if (this._userno == null) {
      throw new SNFSError('Not logged in.');
    }
    const user = this._snfs._lookup_user(this._userno);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    return user;
  }

  _check_access(): void {
    const user = this._lookup_user();
    if (user.fs == null || user.fs._fsno != this._fs._fsno) {
      throw new SNFSError('Access denied.');
    }
    for (const fs of this._union) {
      const it = user.union.find(ufs => ufs._fsno == fs._fsno);
      if (it == null) {
        throw new SNFSError('Access denied.');
      }
    }
  }

  info(): FileSystemInfo {
    return {
      fs_token: JSON.stringify({ fsno: this._fsno, union: this._union.map(ufs => ufs._fsno), writeable: this._writeable }),
      fsno: this._fsno,
      union: this._union.map(ufs => ufs._fsno),
    };
  }

  detail(): Promise<SNFSFileSystemSessionDetail> {
    return Promise.resolve({
      fs_token: JSON.stringify({ fsno: this._fsno, union: this._union.map(ufs => ufs._fsno), writeable: this._writeable }),
      fs: fileSystemToDetail(this._fs),
      union: this._union.map(fileSystemToDetail),
    });
  }

  readdir(path: string): Promise<SNFSReadDir[]> {
    this._check_access();
    const result = this._fs._readdir(path);
    if (!this._writeable) {
      for (const f of result) {
        f.writeable = false;
      }
    }
    for (const fs of this._union) {
      const more = fs._readdir(path);
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
    return Promise.resolve(result);
  }

  stat(path: string): Promise<SNFSStat> {
    this._check_access();
    const errors = [];
    for (const fs of [this._fs, ...this._union]) {
      try {
        const result = fs._stat(path);
        if (errors.length > 0 || !this._writeable) {
          result.writeable = false;
        }
        return Promise.resolve(result);
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

  writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile> {
    this._check_access();
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    return Promise.resolve(this._fs._writefile(path, data, options));
  }

  readfile(path: string): Promise<SNFSReadFile> {
    this._check_access();
    const errors = [];
    for (const fs of [this._fs, ...this._union]) {
      try {
        return Promise.resolve(fs._readfile(path));
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

  unlink(path: string): Promise<SNFSUnlink> {
    this._check_access();
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    // We'll defer the unlink error and throw if if none of the unioned fs's
    // have the file. Otherwise we'll throw a permission denied.
    let error = null;
    try {
      return Promise.resolve(this._fs._unlink(path));
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
        fs._stat(path);
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

  move(path: string, newpath: string): Promise<SNFSMove> {
    this._check_access();
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    let error = null;
    try {
      return Promise.resolve(this._fs._move(path, newpath));
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
        fs._stat(path);
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

export interface LoginOptionsMemory {
  name: string;
  password: string;
}

interface UserRecord {
  userno: string;
  name: string;
  password: string;
  admin: boolean;
  fs: SNFSFileSystemMemory | null;
  union: SNFSFileSystemMemory[];
}

interface SNFSFileMemory {
  name: string;
  ino: string;
  ctime: Date;
  mtime: Date;
  data: Uint8Array;
}
