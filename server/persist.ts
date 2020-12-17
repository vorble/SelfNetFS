import fs = require('fs');

import {
  SNFSError,
  SNFSFileSystemLimits,
} from '../src/SNFS';
import {
  SNFSFileMemory,
  SNFSFileSystemMemory,
  SNFSMemory,
  UserRecord,
} from '../src/SNFSMemory';

export default class Persist {
  save(owner: string, snfs: SNFSMemory): void {
    const content = stringify(snfs);
    try {
      fs.writeFileSync('database/' + owner + '.json', content);
    } catch (err) {
      if (err.code == 'ENOENT') {
        fs.mkdirSync('database');
        fs.writeFileSync('database/' + owner + '.json', content);
      }
    }
  }

  // load() might get called for non-existant owners very
  // often, so it is designed not to throw and instead returns
  // null if there is a problem (usually file not found).
  load(owner: string, factory: () => SNFSMemory): SNFSMemory {
    try {
      const content = fs.readFileSync('database/' + owner + '.json');
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

interface SNFSMemoryDump {
  fss: SNFSFileSystemMemoryDump[];
  users: UserRecordDump[];
}
function dumpSNFSMemory(snfs: SNFSMemory): SNFSMemoryDump {
  const users = [];
  for (const user of snfs._users.values()) {
    users.push(dumpUserRecord(user));
  }
  return {
    fss: snfs._fss.map(dumpSNFSFileSystemMemory),
    users,
  };
}
function loadSNFSMemory(obj: any, snfs: SNFSMemory) {
  snfs._fss.length = 0;
  const fss = obj.fss.map(fs => loadSNFSFileSystemMemory(fs, snfs));
  snfs._fss = fss;
  const users = obj.users.map(user => loadUserRecord(user, snfs));
  snfs._users = users;
}

interface SNFSFileSystemMemoryDump {
  name: string;
  fsno: string;
  limits: SNFSFileSystemLimits;
  files: SNFSFileMemoryDump[];
}
function dumpSNFSFileSystemMemory(fs: SNFSFileSystemMemory): SNFSFileSystemMemoryDump {
  const files = [];
  for (const file of fs._files.values()) {
    files.push(dumpSNFSFileMemory(file));
  }
  return {
    name: fs.name,
    fsno: fs.fsno,
    limits: fs.limits,
    files,
  };
}
function loadSNFSFileSystemMemory(fs: any, snfs: SNFSMemory): SNFSFileSystemMemory {
  const result = new SNFSFileSystemMemory(fs.name, fs.fsno, fs.limits, snfs._uuidgen);
  for (const file of fs.files) {
    const f = loadSNFSFileMemory(file);
    result._files.set(f.name, f);
    result._stored_bytes += f.data.length;
  }
  return result;
}

interface SNFSFileMemoryDump {
  name: string;
  ino: string;
  ctime: number;
  mtime: number;
  data: string; // base64 encoded.
}
function dumpSNFSFileMemory(file: SNFSFileMemory): SNFSFileMemoryDump {
  // TODO: File data is Uint8Array, but typescript is not happy since toString() method
  // doesn't take an argument.
  const data: any = file.data;
  return {
    name: file.name,
    ino: file.ino,
    ctime: file.ctime.getTime(),
    mtime: file.mtime.getTime(),
    data: data.toString('base64'),
  };
}
function loadSNFSFileMemory(file: any): SNFSFileMemory {
  return {
    name: file.name,
    ino: file.ino,
    ctime: new Date(file.ctime),
    mtime: new Date(file.mtime),
    data: Buffer.from(file.data, 'base64'),
  };
}

interface UserRecordDump {
  name: string;
  password: string;
  admin: boolean;
  fs: string; // fsno
  union: string[]; // fsno[]
}
function dumpUserRecord(user: UserRecord): UserRecordDump {
  return {
    name: user.name,
    password: user.password,
    admin: user.admin,
    fs: (user.fs || {}).fsno || null,
    union: user.union.map(ufs => ufs.fsno),
  };
}
function loadUserRecord(user: any, snfs: SNFSMemory): UserRecord {
  function lookupFS(fsno: string): SNFSFileSystemMemory {
    const fs = snfs._fss.find(fs => fs.fsno == fsno);
    if (fs == null) {
      throw new SNFSError('File system not found.');
    }
    return fs;
  }
  return {
    name: user.name,
    password: user.password,
    admin: user.admin,
    fs: user.fs == null ? null : lookupFS(user.fs),
    union: user.union.map(lookupFS),
  };
}
