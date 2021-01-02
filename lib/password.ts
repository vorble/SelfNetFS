export abstract class PasswordModule {
  abstract hash(password: string): string;
  abstract check(password: string, hash: string): boolean;
}

export class PasswordModuleNull extends PasswordModule {
  hash(password: string): string {
    return password;
  }

  check(password: string, hash: string): boolean {
    return password === hash;
  }
}
