import 'mocha';
import * as uuid from 'uuid';
import { equal } from 'assert';
import { Http } from 'selfnetfs';
import { Memory, PasswordModuleNull } from 'selfnetfs-memory';
import { Server, PersistMemory } from 'selfnetfs-server';

const persist = new PersistMemory();
persist.bootstrap('owner', 'user', 'password');
const server = new Server({
  port: 4001,
  persist: persist,
});

function abit() {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1000);
  });
}

describe('testing', function() {
  it('should log in', async function() {
    server.listen();
    await abit(); // So there's time for the listener to start
    const api = new Http('http://127.0.0.1:4001/owner');
    await api.login({ name: 'user', password: 'password' });
    server.destroy();
  });
});
