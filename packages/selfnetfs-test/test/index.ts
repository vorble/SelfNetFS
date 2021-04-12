import 'mocha';
import * as uuid from 'uuid';
import { equal } from 'assert';
import { Http } from 'selfnetfs';
import { Memory, PasswordModuleNull } from 'selfnetfs-memory';
import { Server, PersistMemory } from 'selfnetfs-server';

export class LoggerNull {
  error(...args: any[]): void {}
  log(...args: any[]): void {}
}

const persist = new PersistMemory();
persist.bootstrap('owner', 'user', 'password');
const server = new Server({
  port: 4001,
  persist: persist,
  logger: new LoggerNull(),
});

describe('testing', function() {
  it('should log in', async function() {
    await server.listen();
    const api = new Http('http://127.0.0.1:4001/owner');
    await api.login({ name: 'user', password: 'password' });
    server.destroy();
  });
});
