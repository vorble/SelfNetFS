import fs = require('fs');
import path = require('path');
import * as uuid from 'uuid';

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
} from 'selfnetfs-common';
import {
  FileSystemMemory,
  Memory,
  SessionMemory,
} from 'selfnetfs-memory';
import {
  PasswordModuleHash,
} from './password';
import cloneDeep = require('lodash.clonedeep');
import {
  Logger,
} from './log';

// The base class for every persistance layer. A persistance layer is used by
// the server to handle the requests from the client.
export abstract class PersistBase {
  abstract getSNFSForOwner(owner: string): SNFS;
}

// Persistance layer that doesn't persist.
export class PersistMemory extends PersistBase {
  private owners: Map<string, Memory>;
  private nullOwner: Memory;

  constructor() {
    super();
    this.owners = new Map<string, Memory>();
    this.nullOwner = this._newSNFS();
  }

  private _newSNFS(): Memory {
    return new Memory(uuid.v4, new PasswordModuleHash());
  }

  // NOTE: Used by tests to set up an owner.
  bootstrap(owner: string, name: string, password: string) {
    const snfs = this._newSNFS();
    snfs.bootstrap(name, password);
    this.owners.set(owner, snfs);
  }

  getSNFSForOwner(owner: string): SNFS {
    const snfs = this.owners.get(owner);
    if (snfs != null) {
      return snfs;
    }
    return this.nullOwner;
  }
}

interface PersistMemoryDumpOptions {
  dataDirectory: string;
  logger: Logger;
}

// A persistance layer which is backed by the in-memory implementation and
// dumps the data to a file.
export class PersistMemoryDump extends PersistBase {
  private options: PersistMemoryDumpOptions;
  private owners: Map<string, PersistMemoryDumpSNFS>;
  private nullOwner: PersistMemoryDumpSNFS;

  constructor(options: PersistMemoryDumpOptions) {
    super();
    this.options = { ...options };
    this.owners = new Map<string, PersistMemoryDumpSNFS>();
    this.nullOwner = this._newSNFS('');
  }

  private _newSNFS(owner: string): PersistMemoryDumpSNFS {
    return new PersistMemoryDumpSNFS(
      this.options,
      owner,
      new Memory(uuid.v4, new PasswordModuleHash()),
    );
  }

  // NOTE: Used by the cli to set up an owner.
  bootstrap(owner: string, name: string, password: string) {
    const snfs = this._newSNFS(owner);
    snfs.snfs.bootstrap(name, password);
    snfs.save();
    this.owners.set(owner, snfs);
  }

  getSNFSForOwner(owner: string): SNFS {
    const snfs = this.owners.get(owner);
    if (snfs != null) {
      return snfs;
    }
    const snfs2 = this._loadSNFSForOwner(owner);
    if (snfs2 != null) {
      return snfs2;
    }
    return this.nullOwner;
  }

  private _loadSNFSForOwner(owner: string): SNFS | null {
    const snfs = this._newSNFS(owner);
    if (snfs.load()) {
      return snfs;
    }
    return null;
  }
}

export class PersistMemoryDumpSNFS extends SNFS {
  options: PersistMemoryDumpOptions;
  owner: string;
  snfs: Memory;
  snfsCopy: Memory | null;

  constructor(options: PersistMemoryDumpOptions, owner: string, snfs: Memory) {
    super();

    this.options = options;
    this.owner = owner;
    this.snfs = snfs;
    this.snfsCopy = null;
  }

  save() {
    const content = stringify(this.snfs);
    try {
      fs.writeFileSync(path.join(this.options.dataDirectory, this.owner + '.json'), content);
    } catch (err) {
      if (err.code == 'ENOENT') {
        this.options.logger.log(`Could not persist database. Did you create the directory ${ this.options.dataDirectory }?`);
      }
      throw err;
    }
  }

  load(): boolean {
    try {
      const content = fs.readFileSync(path.join(this.options.dataDirectory, this.owner + '.json'));
      parse(content.toString('utf-8'), this.snfs);
      return true;
    } catch (err) {
      // File not found errors are expected.
      if (err.code != 'ENOENT') {
        this.options.logger.error(err);
      }
      return false;
    }
  }

  login(options: LoginOptions): Promise<Session> {
    const session = this.snfs._login(options);
    const result = new PersistMemoryDumpSession(this, session);
    return Promise.resolve(result);
  }

  resume(session_token: string): Promise<Session> {
    const session = this.snfs._resume(session_token);
    const result = new PersistMemoryDumpSession(this, session);
    return Promise.resolve(result);
  }

  doAndSave<T>(action: () => T): T {
    const cloned = cloneDeep(this.snfs);
    const result = action();
    try {
      this.save();
    } catch (err) {
      this.snfs = cloned;
      throw err;
    }
    return result;
  }
}

export class PersistMemoryDumpSession extends Session {
  snfs: PersistMemoryDumpSNFS;
  session: SessionMemory;

  constructor(snfs: PersistMemoryDumpSNFS, session: SessionMemory) {
    super();

    this.snfs = snfs;
    this.session = session;
  }

  info(): SessionInfo {
    return this.session.info();
  }

  detail(): Promise<SessionDetail> {
    return this.session.detail();
  }

  logout(): Promise<LogoutResult> {
    return this.session.logout();
  }

  useradd(options: UseraddOptions): Promise<UserInfo> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._useradd(options);
    }));
  }

  usermod(userno: string, options: UsermodOptions): Promise<UserInfo> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._usermod(userno, options);
    }));
  }

  userdel(userno: string): Promise<UserdelResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._userdel(userno);
    }));
  }

  userlist(): Promise<UserInfo[]> {
    return this.session.userlist();
  }

  fs(): Promise<FileSystem> {
    const fs = this.session._fs();
    const result = new PersistMemoryDumpFileSystem(this.snfs, fs);
    return Promise.resolve(result);
  }

  fsget(fsno: string, options?: FsgetOptions): Promise<FileSystem> {
    const fs = this.session._fsget(fsno, options);
    const result = new PersistMemoryDumpFileSystem(this.snfs, fs);
    return Promise.resolve(result);
  }

  fsresume(fs_token: string): Promise<FileSystem> {
    const fs = this.session._fsresume(fs_token);
    const result = new PersistMemoryDumpFileSystem(this.snfs, fs);
    return Promise.resolve(result);
  }

  fsadd(options: FsaddOptions): Promise<FsaddResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._fsadd(options);
    }));
  }

  fsmod(fsno: string, options: FsmodOptions): Promise<FsmodResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._fsmod(fsno, options);
    }));
  }

  fsdel(fsno: string): Promise<FsdelResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._fsdel(fsno);
    }));
  }

  fslist(): Promise<FslistResult[]> {
    return this.session.fslist();
  }

  grant(userno: string, options: GrantOptions | GrantOptions[]): Promise<GrantResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.session._grant(userno, options);
    }));
  }
}

export class PersistMemoryDumpFileSystem {
  snfs: PersistMemoryDumpSNFS;
  fs: FileSystemMemory;

  constructor(snfs: PersistMemoryDumpSNFS, fs: FileSystemMemory) {
    this.snfs = snfs;
    this.fs = fs;
  }

  info(): FileSystemInfo {
    return this.fs.info();
  }

  detail(): Promise<FileSystemDetail> {
    return this.fs.detail();
  }

  readdir(path: string): Promise<ReaddirResult[]> {
    return this.fs.readdir(path);
  }

  stat(path: string): Promise<StatResult> {
    return this.fs.stat(path);
  }

  writefile(path: string, data: Uint8Array, options?: WritefileOptions): Promise<WritefileResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.fs._writefile(path, data, options);
    }));
  }

  readfile(path: string): Promise<ReadfileResult> {
    return this.fs.readfile(path);
  }

  unlink(path: string): Promise<UnlinkResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.fs._unlink(path);
    }));
  }

  move(path: string, newpath: string): Promise<MoveResult> {
    return Promise.resolve(this.snfs.doAndSave(() => {
      return this.fs._move(path, newpath);
    }));
  }
}


// Extracts the content of an Memory instance so that the parse() function can
// restore the data into an Memory instance at a later time.
function stringify(snfs: Memory): string {
  return JSON.stringify(dumpMemory(snfs));
}

// Replace the contents of the given Memory instance.
function parse(dump: string, snfs: Memory): void {
  const obj = JSON.parse(dump);
  loadMemory(obj, snfs);
}

interface MemoryDump {
  fss: FileSystemMemoryDump[];
  users: UserRecordDump[];
}
function dumpMemory(snfs: Memory): MemoryDump {
  const users = [];
  for (const user of snfs._users.values()) {
    users.push(dumpUserRecord(user));
  }
  return {
    fss: snfs._fss.map(dumpFileSystemMemory),
    users,
  };
}
function loadMemory(obj: any, snfs: Memory) {
  snfs._fss.length = 0;
  const fss = obj.fss.map((fs: any) => loadFileSystemMemory(fs, snfs));
  snfs._fss = fss;
  const users = obj.users.map((user: any) => loadUserRecord(user, snfs));
  snfs._users = users;
}

interface FileSystemMemoryDump {
  name: string;
  fsno: string;
  limits: FSLimits;
  files: FileRecordDump[];
}
function dumpFileSystemMemory(fs: FileSystemMemory): FileSystemMemoryDump {
  const files = [];
  for (const file of fs._files.values()) {
    files.push(dumpFileRecord(file));
  }
  return {
    name: fs._name,
    fsno: fs._fsno,
    limits: fs._limits,
    files,
  };
}
function loadFileSystemMemory(fs: any, snfs: Memory): FileSystemMemory {
  const result = new FileSystemMemory(fs.name, fs.fsno, fs.limits, snfs._uuidgen);
  for (const file of fs.files) {
    const f = loadFileRecord(file);
    result._files.set(f.name, f);
    result._stored_bytes += f.data.length;
  }
  return result;
}

// Duplicate of FileRecord defined for the in-memory implementation so
// the interface/class doesn't need to be exported but we can still
// catch type discrepencies.
interface FileRecord {
  name: string;
  ino: string;
  ctime: Date;
  mtime: Date;
  data: Uint8Array;
}
interface FileRecordDump {
  name: string;
  ino: string;
  ctime: number;
  mtime: number;
  data: string; // base64 encoded.
}
function dumpFileRecord(file: FileRecord): FileRecordDump {
  return {
    name: file.name,
    ino: file.ino,
    ctime: file.ctime.getTime(),
    mtime: file.mtime.getTime(),
    data: Buffer.from(file.data).toString('base64'),
  };
}
function loadFileRecord(file: any): FileRecord {
  return {
    name: file.name,
    ino: file.ino,
    ctime: new Date(file.ctime),
    mtime: new Date(file.mtime),
    data: new Uint8Array(Buffer.from(file.data, 'base64')),
  };
}

// Duplicate of UserRecord defined for the in-memory implementation so
// the interface/class doesn't need to be exported but we can still
// catch type discrepencies.
interface UserRecord {
  userno: string;
  name: string;
  password: string;
  admin: boolean;
  fs: FileSystemMemory | null;
  union: FileSystemMemory[];
}
interface UserRecordDump {
  userno: string;
  name: string;
  password: string;
  admin: boolean;
  fs: string | null; // fsno
  union: string[]; // fsno[]
}

function dumpUserRecord(user: UserRecord): UserRecordDump {
  return {
    userno: user.userno,
    name: user.name,
    password: user.password,
    admin: user.admin,
    fs: (user.fs || {})._fsno || null,
    union: user.union.map(ufs => ufs._fsno),
  };
}

function loadUserRecord(user: any, snfs: Memory): UserRecord {
  function lookupFS(fsno: string): FileSystemMemory {
    const fs = snfs._fss.find(fs => fs._fsno == fsno);
    if (fs == null) {
      throw new SNFSError('File system not found.');
    }
    return fs;
  }
  return {
    userno: user.userno,
    name: user.name,
    password: user.password,
    admin: user.admin,
    fs: user.fs == null ? null : lookupFS(user.fs),
    union: user.union.map(lookupFS),
  };
}
