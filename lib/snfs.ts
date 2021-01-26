export class SNFSError extends Error {}

export abstract class SNFS {
  abstract login(options: LoginOptions): Promise<Session>;
  abstract resume(session_token: string): Promise<Session>;
}

export abstract class Session {
  abstract info(): SessionInfo;
  abstract detail(): Promise<SessionDetail>;

  abstract logout(): Promise<LogoutResult>;

  abstract useradd(options: UseraddOptions): Promise<UserInfo>;
  abstract usermod(userno: string, options: UsermodOptions): Promise<UserInfo>;
  abstract userdel(userno: string): Promise<UserdelResult>;
  abstract userlist(): Promise<UserInfo[]>;

  abstract fs(): Promise<FileSystem>;
  abstract fsget(fsno: string, options?: FsgetOptions): Promise<FileSystem>;
  abstract fsresume(fs_token: string): Promise<FileSystem>;
  abstract fsadd(options: FsaddOptions): Promise<FsaddResult>;
  abstract fsmod(fsno: string, options: FsmodOptions): Promise<FsmodResult>;
  abstract fsdel(fsno: string): Promise<FsdelResult>;
  // XXX: Use fslist to show all file systems a user has access to.
  abstract fslist(): Promise<FslistResult[]>;

  // XXX: For granting a user access to a file system.
  //abstract grant(userno: string, options: GrantOptions): Promise<GrantResult>;
}

export abstract class FileSystem {
  abstract info(): FileSystemInfo;
  abstract detail(): Promise<FileSystemDetail>;

  abstract readdir(path: string): Promise<ReaddirResult[]>;
  abstract stat(path: string): Promise<StatResult>;
  abstract writefile(path: string, data: Uint8Array, options?: WritefileOptions): Promise<WritefileResult>;
  abstract readfile(path: string): Promise<ReadfileResult>;
  abstract unlink(path: string): Promise<UnlinkResult>;
  abstract move(path: string, newpath: string): Promise<MoveResult>;
}

export interface FileSystemDetail {
  fs_token: string;
  fs: FSDetail;
  union: FSDetail[];
}

export interface FileSystemInfo {
  fs_token: string;
  fsno: string;
  union: string[];
}

export interface FSAccess {
  name: string;
  fsno: string;
  writeable: boolean;
}

export interface FsaddOptions {
  name: string;
  max_files?: number;
  max_storage?: number;
  max_depth?: number;
  max_path?: number;
}

export interface FsaddResult {
  name: string;
  fsno: string;
  limits: FSLimits;
}

export interface FsdelResult {
}

export interface FSDetail {
  name: string;
  fsno: string;
  limits: FSLimits;
  usage: FSUsage;
}

export interface FsgetOptions {
  writeable?: boolean; // Writable bit mask. Set to true to request a writeable fs.
  union?: string[]; // Array of fsno
}

export interface FSLimits {
  max_files: number;
  max_storage: number;
  max_depth: number;
  max_path: number;
}

// XXX: add a writeable flag
export interface FslistResult {
  name: string;
  fsno: string;
  limits: FSLimits;
}

export interface FsmodOptions {
  name?: string;
  max_files?: number;
  max_storage?: number;
  max_depth?: number;
  max_path?: number;
}

export interface FsmodResult {
  name: string;
  fsno: string;
  limits: FSLimits;
}

export interface FSUsage {
  no_files: number;
  bytes_used: number; // BigInt maybe?
}

// XXX: New interface.
export interface GrantOptions {
  fs_can_write?: string[];
  fs_can_union?: string[]; // For when you want to down-grade form writeable or just make it readable.
  fs_revoke?: string[]; // For when you want to revoke access to a file system.
}

// XXX: New interface.
export interface GrantResult {
}

export interface LoginOptions {
  name: string;
  password: string;
}

export interface LogoutResult {
}

export interface MoveResult {
}

export enum NodeKind {
  File = 'file',
  Directory = 'dir',
}

export interface ReaddirResult {
  name: string;
  kind: NodeKind;
  // Below only for files.
  ino?: string; // uuid, like inode number in other file systems
  ctime?: Date;
  mtime?: Date;
  size?: number; // BigInt maybe?
  writeable?: boolean;
}

export interface ReadfileResult {
  data: Uint8Array;
}

export interface SessionDetail {
  session_token: string;
  user: UserInfo;
}

export interface SessionInfo {
  session_token: string;
  userno: string;
}

export interface StatResult {
  name: string;
  kind: NodeKind;
  ino: string; // uuid, like inode number in other file systems
  ctime: Date;
  mtime: Date;
  size: number; // BigInt maybe?
  writeable: boolean;
}

export interface UnlinkResult {
}

export interface UseraddOptions {
  name: string;
  password: string;
  admin?: boolean;
  fs?: string | null;
  union?: string[];
}

export interface UserdelResult {
}

export interface UserInfo {
  userno: string;
  name: string;
  admin: boolean;
  fs: FSAccess | null;
  union: FSAccess[];
}

export interface UsermodOptions {
  name?: string;
  password?: string;
  admin?: boolean;
  fs?: string | null;
  union?: string[];
}

export interface WritefileOptions {
  // To preserve the ino of the file. Default is to not preserve.
  truncate?: boolean;
}

export interface WritefileResult {
  ino: string;
}
