export class SNFSError extends Error {}

export abstract class SNFS {
  abstract login(options: LoginOptions): Promise<SNFSSession>;
  abstract resume(session_token: string): Promise<SNFSSession>;
}

export abstract class SNFSSession {
  abstract info(): SessionInfo;
  abstract detail(): Promise<SessionDetail>;

  abstract logout(): Promise<LogoutResult>;

  abstract useradd(options: UseraddOptions): Promise<UserInfo>;
  abstract usermod(userno: string, options: UsermodOptions): Promise<UserInfo>;
  abstract userdel(userno: string): Promise<UserdelResult>;
  abstract userlist(): Promise<UserInfo[]>;

  abstract fs(): Promise<SNFSFileSystem>;
  abstract fsget(fsno: string, options?: FsgetOptions): Promise<SNFSFileSystem>;
  abstract fsresume(fs_token: string): Promise<SNFSFileSystem>;
  abstract fsadd(options: FsaddOptions): Promise<FSInfo>;
  abstract fsmod(fsno: string, options: FsmodOptions): Promise<FSInfo>;
  abstract fsdel(fsno: string): Promise<FsdelResult>;
  abstract fslist(): Promise<FSInfo[]>;
}

export abstract class SNFSFileSystem {
  abstract info(): FileSystemInfo;
  abstract detail(): Promise<FileSystemDetail>;

  abstract readdir(path: string): Promise<ReaddirResult[]>;
  abstract stat(path: string): Promise<StatResult>;
  abstract writefile(path: string, data: Uint8Array, options?: WritefileOptions): Promise<WritefileResult>;
  abstract readfile(path: string): Promise<ReadfileResult>;
  abstract unlink(path: string): Promise<UnlinkResult>;
  abstract move(path: string, newpath: string): Promise<MoveResult>;
}

export interface SessionInfo {
  session_token: string;
  userno: string;
}

export interface SessionDetail {
  session_token: string;
  user: UserInfo;
}

export interface FileSystemInfo {
  fs_token: string;
  fsno: string;
  union: string[];
}

export interface FileSystemDetail {
  fs_token: string;
  fs: FSDetail;
  union: FSDetail[];
}

export interface FSInfo {
  name: string;
  fsno: string;
  limits: FSLimits;
}

export interface FSDetail {
  name: string;
  fsno: string;
  limits: FSLimits;
  usage: SNFSFileSystemUsage;
}

export interface SNFSFileSystemUsage {
  no_files: number;
  bytes_used: number; // BigInt maybe?
}

// Each SNFS sub-class might need its own type of credentials, so this class is just a place
// holder. For now, assume it holds your selfnetfs username and password.
interface LoginOptions {}

export interface FsgetOptions {
  writeable?: boolean; // Writable bit mask. Set to true to request a writeable fs.
  union?: string[]; // Array of fsno
}

export interface LogoutResult {
}

export interface UserInfo {
  userno: string;
  name: string;
  admin: boolean;
  fs: SNFSFileSystemAccess | null;
  union: SNFSFileSystemAccess[];
}

export interface UseraddOptions {
  name: string;
  password: string;
  admin?: boolean;
  fs?: string | null;
  union?: string[];
}

export interface UsermodOptions {
  name?: string;
  password?: string;
  admin?: boolean;
  fs?: string | null;
  union?: string[];
}

export interface UserdelResult {
}

export interface SNFSFileSystemAccess {
  name: string;
  fsno: string;
  writeable: boolean;
}

export interface FSLimits {
  max_files: number;
  max_storage: number;
  max_depth: number;
  max_path: number;
}

export interface FsaddOptions {
  name: string;
  max_files?: number;
  max_storage?: number;
  max_depth?: number;
  max_path?: number;
}

export interface FsmodOptions {
  name?: string;
  max_files?: number;
  max_storage?: number;
  max_depth?: number;
  max_path?: number;
}

export interface FsdelResult {
}

export enum SNFSNodeKind {
  File = 'file',
  Directory = 'dir',
}

export interface ReaddirResult {
  name: string;
  kind: SNFSNodeKind;
  // Below only for files.
  ino?: string; // uuid, like inode number in other file systems
  ctime?: Date;
  mtime?: Date;
  size?: number; // BigInt maybe?
  writeable?: boolean;
}

export interface StatResult {
  name: string;
  kind: SNFSNodeKind;
  ino: string; // uuid, like inode number in other file systems
  ctime: Date;
  mtime: Date;
  size: number; // BigInt maybe?
  writeable: boolean;
}

export interface WritefileOptions {
  // To preserve the ino of the file. Default is to not preserve.
  truncate?: boolean;
}

export interface WritefileResult {
  ino: string;
}

export interface ReadfileResult {
  data: Uint8Array;
}

export interface UnlinkResult {
}

export interface MoveResult {
}
