export class SNFSError extends Error {}

export abstract class SNFS {
  abstract login(options: SNFSAuthCredentials): Promise<SNFSSession>;
  abstract resume(session_token: string): Promise<SNFSSession>;
}

export abstract class SNFSSession {
  abstract info(): SNFSSessionInfo;
  abstract detail(): Promise<SNFSSessionDetail>;

  abstract logout(): Promise<SNFSLogout>;

  abstract useradd(options: SNFSUserOptions): Promise<SNFSUserInfo>;
  abstract usermod(userno: string, options: SNFSUserOptions): Promise<SNFSUserInfo>;
  abstract userdel(userno: string): Promise<SNFSUserDel>;
  abstract userlist(): Promise<SNFSUserInfo[]>;

  abstract fs(): Promise<SNFSFileSystem>;
  abstract fsget(fsno: string, options: SNFSFileSystemGetOptions): Promise<SNFSFileSystem>;
  abstract fsresume(fs_token: string): Promise<SNFSFileSystem>;
  abstract fsadd(options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo>;
  abstract fsmod(fsno: string, options: SNFSFileSystemOptions): Promise<SNFSFileSystemInfo>;
  abstract fsdel(fsno: string): Promise<SNFSFileSystemDel>;
  abstract fslist(): Promise<SNFSFileSystemInfo[]>;
}

export abstract class SNFSFileSystem {
  abstract info(): SNFSFileSystemSessionInfo;
  abstract detail(): Promise<SNFSFileSystemSessionDetail>;

  abstract readdir(path: string): Promise<SNFSReadDir[]>;
  abstract stat(path: string): Promise<SNFSStat>;
  abstract writefile(path: string, data: Uint8Array, options: SNFSWriteFileOptions): Promise<SNFSWriteFile>;
  abstract readfile(path: string): Promise<SNFSReadFile>;
  abstract unlink(path: string): Promise<SNFSUnlink>;
  abstract move(path: string, newpath: string): Promise<SNFSMove>;
}

export interface SNFSSessionInfo {
  session_token: string;
  userno: string;
}

export interface SNFSSessionDetail {
  session_token: string;
  user: SNFSUserInfo;
}

export interface SNFSFileSystemSessionInfo {
  fs_token: string;
  fsno: string;
  union: string[];
}

export interface SNFSFileSystemSessionDetail {
  fs_token: string;
  fs: SNFSFileSystemDetail;
  union: SNFSFileSystemDetail[];
}

export class SNFSFileSystemInfo {
  name: string;
  fsno: string;
  limits: SNFSFileSystemLimits;
}

export class SNFSFileSystemDetail {
  name: string;
  fsno: string;
  limits: SNFSFileSystemLimits;
  // TODO: Should also add information about current counts.
}

// Each SNFS sub-class might need its own type of credentials, so this class is just a place
// holder. For now, assume it holds your selfnetfs server URL, username, and password.
interface SNFSAuthCredentials {}

export interface SNFSFileSystemGetOptions {
  writeable: boolean; // Writable bit mask. Set to true to request a writeable fs.
  union: string[]; // Array of fsno
}

export interface SNFSLogout {
}

export interface SNFSUserInfo {
  userno: string;
  name: string;
  admin: boolean;
  fs: SNFSFileSystemAccess;
  union: SNFSFileSystemAccess[];
}

export interface SNFSUserOptions {
  name?: string;
  password?: string;
  admin?: boolean;
  fs?: string;
  union?: string[];
}

export interface SNFSUserDel {
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
  max_path: number;
}

export interface SNFSFileSystemOptions {
  name?: string;
  max_files?: number;
  max_storage?: number;
  max_depth?: number;
  max_path?: number;
}

export interface SNFSFileSystemDel {
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
  data: Uint8Array;
}

export interface SNFSUnlink {
}

export interface SNFSMove {
}
