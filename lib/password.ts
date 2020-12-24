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
