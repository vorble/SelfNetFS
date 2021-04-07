import {
  FSDetail,
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
  NodeKind,
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
} from '../snfs';
import {
  PasswordModule,
  PasswordModuleNull,
} from '../password';
import {
  PermissionSet
} from './permissions';

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

function fileSystemOptionsToLimits(options: FsmodOptions | FsaddOptions, fallback: FSLimits): FSLimits {
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

// XXX: Rename the function?
function fileSystemToInfo(fs: FileSystemMemory): FsaddResult | FsmodResult {
  return {
    name: fs._name,
    fsno: fs._fsno,
    limits: { ...fs._limits },
  };
}

function fileSystemToDetail(fs: FileSystemMemory): FSDetail {
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

export class Memory extends SNFS {
  _uuidgen: () => string;
  _password_module: PasswordModule;
  _fss: FileSystemMemory[];
  _users: UserRecord[];
  _permissions: PermissionSet;

  constructor(uuidgen: () => string, password_module: PasswordModule) {
    super();

    this._uuidgen = uuidgen;
    this._password_module = password_module;
    this._fss = [];
    this._users = [];
    this._permissions = new PermissionSet();
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
    const fs = new FileSystemMemory('default', this._uuidgen_unique_fsno(), LIMITS, this._uuidgen);
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
    this._permissions.set({
      userno: user.userno,
      fsno: fs._fsno,
      writeable: true,
      readable: true,
    });
  }

  _lookup_user(userno: string): UserRecord | null {
    return this._users.find(u => u.userno == userno) || null;
  }

  login(options: LoginOptions): Promise<Session> {
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
    const session = new SessionMemory(this, user);
    return Promise.resolve(session);
  }

  _resume(session_token: string): Session {
    const user = this._users.find(u => u.userno == session_token);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    const session = new SessionMemory(this, user);
    return session;
  }

  resume(session_token: string): Promise<Session> {
    return Promise.resolve(this._resume(session_token));
  }
}

export class SessionMemory extends Session {
  _snfs: Memory;
  _session_token: string;
  _logged_in_userno: string | null;

  constructor(snfs: Memory, user: UserRecord) {
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

  _userfind(userno: string): UserRecord {
    const user = this._snfs._users.find(u => u.userno == userno);
    if (user == null) {
      throw new SNFSError('User not found.');
    }
    return user;
  }

  _usersearch(): UserRecord[] {
    if (this._logged_in_userno == null) {
      return [];
    }
    const logged_in_user = this._snfs._lookup_user(this._logged_in_userno);
    if (logged_in_user == null) {
      return [];
    }
    if (logged_in_user.admin) {
      return this._snfs._users;
    }
    return [logged_in_user];
  }

  _fsfind(fsno: string): FileSystemMemory {
    const logged_in_user = this._lookup_user();
    const fs = this._snfs._fss.find(fs => fs._fsno == fsno);
    if (fs == null) {
      throw new SNFSError('FS not found.');
    }
    if (!logged_in_user.admin) {
      const perm = this._snfs._permissions.get({ userno: logged_in_user.userno, fsno: fs._fsno });
      if (!perm.readable) {
        throw new SNFSError('FS not found.');
      }
    }
    return fs;
  }

  _fsfind_union(fsno: string): FileSystemMemory {
    const logged_in_user = this._lookup_user();
    const fs = this._snfs._fss.find(fs => fs._fsno == fsno);
    if (fs == null) {
      throw new SNFSError('FS not found for union.');
    }
    if (!logged_in_user.admin) {
      const perm = this._snfs._permissions.get({ userno: logged_in_user.userno, fsno: fs._fsno });
      if (!perm.readable) {
        throw new SNFSError('FS not found for union.');
      }
    }
    return fs;
  }

  _fssearch(): FileSystemMemory[] {
    const logged_in_user = this._lookup_user();
    return this._snfs._fss.filter(fs => {
      if (logged_in_user.admin) {
        return true;
      }
      const perm = this._snfs._permissions.get({ userno: logged_in_user.userno, fsno: fs._fsno });
      return perm.readable;
    });
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

  logout(): Promise<LogoutResult> {
    this._logged_in_userno = null;
    return Promise.resolve({});
  }

  // XXX: Needs review for new permissions.
  _useradd_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  useradd(options: UseraddOptions): Promise<UserInfo> {
    this._useradd_check_access();
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
        fs = this._fsfind(options.fs);
        seen_fsnos.push(fs._fsno);
      }
    }
    if (typeof options.union !== 'undefined') {
      for (const ufsno of options.union) {
        const u = this._fsfind_union(ufsno);
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

  _usermod_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  usermod(userno: string, options: UsermodOptions): Promise<UserInfo> {
    this._usermod_check_access();
    const user = this._userfind(userno);
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
        const fs = this._fsfind(options.fs);
        seen_fsnos.push(fs._fsno);
        new_user.fs = fs;
      }
    }
    if (typeof options.union !== 'undefined') {
      const union = [];
      for (const ufsno of options.union) {
        const u = this._fsfind(ufsno);
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

  _userdel_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  userdel(userno: string): Promise<UserdelResult> {
    this._userdel_check_access();
    const logged_in_user = this._lookup_user();
    if (logged_in_user.userno == userno) {
      throw new SNFSError('Cannot delete logged in user.');
    }
    const user = this._userfind(userno);
    this._snfs._users = this._snfs._users.filter(u => u.userno != userno);
    return Promise.resolve({});
  }

  userlist(): Promise<UserInfo[]> {
    return Promise.resolve(this._usersearch().map(userRecordToUserInfo));
  }

  fs(): Promise<FileSystem> {
    const logged_in_user = this._lookup_user();
    const fs = logged_in_user.fs;
    if (fs == null) {
      throw new SNFSError('User has no FS.');
    }
    const writeable = true; // File system is writeable by virtue of being assigned to the user.
    return Promise.resolve(new FileSystemMemoryUnion(fs, logged_in_user.union, writeable, this._snfs._uuidgen, logged_in_user, this._snfs));
  }

  _fsget_defaults(o?: FsgetOptions): FsgetOptionsFull {
    return {
      ...o,
      union: (o||{}).union || [],
      writeable: (o||{}).writeable || false, // t->t, f->f, n->f
    };
  }

  _fsget_check_access(fs: FileSystemMemory, writeable: boolean) {
    // TODO: Since the permission information is moving out
    // from the user objects, there might not be a need to
    // do _lookup_user() everywhere. But how would you handle
    // admin checks?
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      const perm = this._snfs._permissions.get({
        userno: logged_in_user.userno,
        fsno: fs._fsno,
      });
      if (!perm.readable) {
        throw new SNFSError('Not authorized.');
      }
      if (writeable && !perm.writeable) {
        throw new SNFSError('Not authorized.');
      }
    }
  }

  fsget(fsno: string, o?: FsgetOptions): Promise<FileSystem> {
    const options = this._fsget_defaults(o);
    const fs = this._fsfind(fsno);
    this._fsget_check_access(fs, options.writeable);
    const union = options.union.map(fsno => {
      const fs = this._fsfind_union(fsno);
      this._fsget_check_access(fs, false);
      return fs;
    });
    // TODO: Restructure to remove the need to pass the user
    // to the FileSystemMemoryUnion constructor.
    // TODO: Since this._snfs is passed to FileSystemMemoryUnion
    // constructor, I don't need to also pass the uuidgen
    // function.
    return Promise.resolve(new FileSystemMemoryUnion(fs, union, options.writeable,
      this._snfs._uuidgen, this._lookup_user(), this._snfs));
  }

  fsresume(fs_token: string): Promise<FileSystem> {
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

  _fsadd_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  fsadd(options: FsaddOptions): Promise<FsmodResult> {
    this._fsadd_check_access();
    if (!options.name) {
      throw new SNFSError('Option `name` may not be blank.');
    }
    const limits = fileSystemOptionsToLimits(options, LIMITS);
    let fsno = this._snfs._uuidgen_unique_fsno();
    const fs = new FileSystemMemory(options.name, fsno, limits, this._snfs._uuidgen);
    this._snfs._fss.push(fs);
    return Promise.resolve(fileSystemToInfo(fs));
  }

  _fsmod_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  fsmod(fsno: string, options: FsmodOptions): Promise<FsmodResult> {
    this._fsmod_check_access();
    const fs = this._fsfind(fsno);
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

  _fsdel_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  fsdel(fsno: string): Promise<FsdelResult> {
    this._fsdel_check_access();
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
    const fs = this._fsfind(fsno);
    this._snfs._fss = this._snfs._fss.filter(x => x._fsno != fsno);
    return Promise.resolve({});
  }

  fslist(): Promise<FslistResult[]> {
    const logged_in_user = this._lookup_user();
    const fss = this._fssearch();
    return Promise.resolve(fss.map((fs: FileSystemMemory) => {
      const perm = this._snfs._permissions.get({ userno: logged_in_user.userno, fsno: fs._fsno });
      return {
        name: fs._name,
        fsno: fs._fsno,
        limits: { ...fs._limits },
        writeable: logged_in_user.admin || perm.writeable,
      };
    }));
  }

  _grant_check_access() {
    const logged_in_user = this._lookup_user();
    if (!logged_in_user.admin) {
      throw new SNFSError('Not authorized.');
    }
  }

  grant(userno: string, options: GrantOptions | GrantOptions[]): Promise<GrantResult> {
    this._grant_check_access();
    if (!Array.isArray(options)) {
      options = [options];
    }
    for (const option of options) {
      this._snfs._permissions.set({
        userno,
        fsno: option.fsno,
        readable: option.readable,
        writeable: option.writeable,
      });
    }
    return Promise.resolve({});
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

export class FileSystemMemory extends FileSystem {
  _name: string;
  _fsno: string;
  _limits: FSLimits;
  _uuidgen: () => string;
  _files: Map<string, FileRecord>;
  _stored_bytes: number;

  constructor(name: string, fsno: string, limits: FSLimits, uuidgen: () => string) {
    super();

    this._name = name;
    this._fsno = fsno;
    this._limits = limits;
    this._uuidgen = uuidgen;
    this._files = new Map<string, FileRecord>();
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

  detail(): Promise<FileSystemDetail> {
    return Promise.resolve({
      fs_token: JSON.stringify({ fsno: this._fsno, union: [], writeable: true }),
      fs: fileSystemToDetail(this),
      union: [],
    });
  }

  _readdir(path: string): ReaddirResult[] {
    path = pathnormfordir(path);
    // Use the fact that path ends with a / to help with the search for files.
    const result: ReaddirResult[] = [];
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
            kind: NodeKind.File,
            ino: f.ino,
            ctime: f.ctime,
            mtime: f.mtime,
            size: f.data.length,
            writeable: true,
          });
        } else {
          // It's a directory. There may be more than one, so check for duplicates.
          const existing = result.find(r => r.name == restparts[0] && r.kind == NodeKind.Directory);
          if (existing == null) {
            result.push({
              name: restparts[0],
              kind: NodeKind.Directory,
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

  readdir(path: string): Promise<ReaddirResult[]> {
    return Promise.resolve(this._readdir(path));
  }

  _stat(path: string): StatResult {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    return {
      name: path,
      kind: NodeKind.File,
      ino: f.ino,
      ctime: f.ctime,
      mtime: f.mtime,
      size: f.data.length,
      writeable: true, // Non-writeability is handled by FileSystemMemoryUnion
    };
  }

  stat(path: string): Promise<StatResult> {
    return Promise.resolve(this._stat(path));
  }

  _writefile(path: string, data: Uint8Array, options?: WritefileOptions): WritefileResult {
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

  writefile(path: string, data: Uint8Array, options: WritefileOptions): Promise<WritefileResult> {
    return Promise.resolve(this._writefile(path, data, options));
  }

  _readfile(path: string): ReadfileResult {
    path = pathnormforfile(path);
    const f = this._files.get(path);
    if (f == null) {
      throw new SNFSError('File not found.');
    }
    return {
      data: f.data.slice(),
    };
  }

  readfile(path: string): Promise<ReadfileResult> {
    return Promise.resolve(this._readfile(path));
  }

  _unlink(path: string): UnlinkResult {
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

  unlink(path: string): Promise<UnlinkResult> {
    return Promise.resolve(this._unlink(path));
  }

  _move(path: string, newpath: string): MoveResult {
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

  move(path: string, newpath: string): Promise<MoveResult> {
    return Promise.resolve(this._move(path, newpath));
  }
}

class FileSystemMemoryUnion extends FileSystemMemory {
  _fs: FileSystemMemory;
  _union: FileSystemMemory[];
  _writeable: boolean;
  _userno: string;
  _snfs: Memory;

  constructor(fs: FileSystemMemory, union: FileSystemMemory[], writeable: boolean, uuidgen: () => string, user: UserRecord, snfs: Memory) {
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

  detail(): Promise<FileSystemDetail> {
    return Promise.resolve({
      fs_token: JSON.stringify({ fsno: this._fsno, union: this._union.map(ufs => ufs._fsno), writeable: this._writeable }),
      fs: fileSystemToDetail(this._fs),
      union: this._union.map(fileSystemToDetail),
    });
  }

  readdir(path: string): Promise<ReaddirResult[]> {
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

  stat(path: string): Promise<StatResult> {
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

  writefile(path: string, data: Uint8Array, options: WritefileOptions): Promise<WritefileResult> {
    this._check_access();
    if (!this._writeable) {
      throw new SNFSError('Permission denied.');
    }
    return Promise.resolve(this._fs._writefile(path, data, options));
  }

  readfile(path: string): Promise<ReadfileResult> {
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

  unlink(path: string): Promise<UnlinkResult> {
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

  move(path: string, newpath: string): Promise<MoveResult> {
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

interface UserRecord {
  userno: string;
  name: string;
  password: string;
  admin: boolean;
  fs: FileSystemMemory | null;
  union: FileSystemMemory[];
}

interface FileRecord {
  name: string;
  ino: string;
  ctime: Date;
  mtime: Date;
  data: Uint8Array;
}

interface FsgetOptionsFull extends FsgetOptions {
  writeable: boolean;
  union: string[];
}
