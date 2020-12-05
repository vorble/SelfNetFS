export class SNFSError extends Error {}

export abstract class SNFS {
  constructor() {
  }

  abstract login(options: SNFSAuthCredentials): Promise<boolean>;
  abstract logout(): Promise<boolean>;
  // After login(), if the user is associated with a file system, that file system
  // is returned by this function. For applications that only need access to a single
  // file system, the rest of the methods in this class are not typically used.
  abstract fs(): Promise<SNFSFileSystem>;

  abstract useradd(options: SNFSUserOptions): Promise<SNFSUserInfo>;
  abstract usermod(name: string, options: SNFSUserOptions): Promise<SNFSUserInfo>;
  abstract userdel(name: string): Promise<boolean>;
  abstract userlist(): Promise<SNFSUserInfo[]>;

  abstract fsadd(options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo>;
  abstract fsmod(fsno: string, options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo>;
  abstract fsdel(fsno: string): Promise<boolean>;
  abstract fslist(): Promise<SNFSFileSystemInfo[]>;
  abstract fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<SNFSFileSystem>;
}

// Each SNFS sub-class might need its own type of credentials, so this class is just a place
// holder. For now, assume it holds your selfnetfs server URL, username, and password.
export abstract class SNFSAuthCredentials {}

export interface SNFSFileSystemGetOptions {
  writeable: boolean; // Writable bit mask. Set to true to request a writeable fs.
  union: string[]; // Array of fsno
}

export interface SNFSUserInfo {
  name: string;
  fs: SNFSFileSystemAccess;
  union: SNFSFileSystemAccess[];
}

export interface SNFSUserOptions {
  name: string;
  password: string;
  fs: string;
  union: string[];
}

export interface SNFSFileSystemAccess {
  name: string;
  fsno: string;
  writeable: boolean;
}

export interface SNFSFileSystemLimits {
  max_files: number;
  max_storage: number;
  max_depth: number;
}

export interface SNFSFileSystemOptions {
  name: string;
  max_files: number;
  max_storage: number;
  max_depth: number;
}

export class SNFSFileSystemInfo {
  name: string;
  limits: SNFSFileSystemLimits;
}

export abstract class SNFSFileSystem {
  limits: SNFSFileSystemLimits;

  constructor() {
    // TODO: My impression of sane limits; will go into the memory/localstorage implementation
    // of SNFSFileSystem.
    this.limits = {
      max_files: 200,
      max_storage: 5 * 1024 * 1024,
      max_depth: 5,
    };
  }

  abstract readdir(path: string): Promise<SNFSReadDir[]>;
  abstract stat(path: string): Promise<SNFSStat>;
  abstract writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile>;
  abstract readfile(path: string): Promise<SNFSReadFile>;
  abstract unlink(path: string): Promise<SNFSUnlink>;
  abstract move(path: string, newpath: string): Promise<SNFSMove>;
}

export enum SNFSNodeKind {
  File = 'file',
  Directory = 'dir',
}

export interface SNFSReadDir {
  name: string;
  kind: SNFSNodeKind;
  // Below only for files.
  ino: string; // uuid, like inode number in other file systems
  ctime: Date;
  mtime: Date;
  size: number; // BigInt maybe?
  writeable: boolean;
}

export interface SNFSStat {
  name: string;
  kind: SNFSNodeKind;
  // Below only for files.
  ino: string; // uuid, like inode number in other file systems
  ctime: Date;
  mtime: Date;
  size: number; // BigInt maybe?
  writeable: boolean;
}

export interface SNFSWriteFileOptions {
  // To preserve the ino of the file. Default is to not preserve.
  truncate: boolean;
}

export interface SNFSWriteFile {
  ino: string;
}

export interface SNFSReadFile {
  data: string;
}

export interface SNFSUnlink {
}

export interface SNFSMove {
}
