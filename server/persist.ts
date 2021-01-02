import fs = require('fs');
import path = require('path');

import {
  SNFSError,
  FSLimits,
} from '../lib/snfs';
import {
  FileSystemMemory,
  SNFSMemory,
} from '../lib/memory';

export default class Persist {
  _database_dir: string;

  constructor(database_dir: string) {
    this._database_dir = database_dir;
  }

  save(owner: string, snfs: SNFSMemory): void {
    const content = stringify(snfs);
    try {
      fs.writeFileSync(path.join(this._database_dir, owner + '.json'), content);
    } catch (err) {
      if (err.code == 'ENOENT') {
        console.log(`Could not persist database. Did you create the directory ${ this._database_dir }?`);
      }
      throw err;
    }
  }

  // load() might get called for non-existant owners very
  // often, so it is designed not to throw and instead returns
  // null if there is a problem (usually file not found).
  load(owner: string, factory: () => SNFSMemory): SNFSMemory | null {
    try {
      const content = fs.readFileSync(path.join(this._database_dir, owner + '.json'));
      const snfs = factory();
      parse(content.toString('utf-8'), snfs);
      return snfs;
    } catch (err) {
      // File not found errors are expected.
      if (err.code != 'ENOENT') {
        console.error(err);
      }
      return null;
    }
  }
}

// Extracts the content of an SNFSMemory instance so that the parse() function can
// restore the data into an SNFSMemory instance at a later time.
function stringify(snfs: SNFSMemory): string {
  return JSON.stringify(dumpSNFSMemory(snfs));
}

// Replace the contents of the given SNFSMemory instance.
function parse(dump: string, snfs: SNFSMemory): void {
  const obj = JSON.parse(dump);
  loadSNFSMemory(obj, snfs);
}

interface MemoryDump {
  fss: FileSystemMemoryDump[];
  users: UserRecordDump[];
}
function dumpSNFSMemory(snfs: SNFSMemory): MemoryDump {
  const users = [];
  for (const user of snfs._users.values()) {
    users.push(dumpUserRecord(user));
  }
  return {
    fss: snfs._fss.map(dumpFileSystemMemory),
    users,
  };
}
function loadSNFSMemory(obj: any, snfs: SNFSMemory) {
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
function loadFileSystemMemory(fs: any, snfs: SNFSMemory): FileSystemMemory {
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
function loadUserRecord(user: any, snfs: SNFSMemory): UserRecord {
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
