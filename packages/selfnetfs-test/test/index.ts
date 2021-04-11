import 'mocha';
import * as uuid from 'uuid';
import { equal } from 'assert';
import { Http } from 'selfnetfs';
import { Memory, PasswordModuleNull } from 'selfnetfs-memory';
import { Server, Persist, OwnerPool } from 'selfnetfs-server';

const persist = new Persist('./database');
const server = new Server({
  port: 4001,
  owners: new OwnerPool<Memory>(persist, () => {
    return new Memory(uuid.v4, new PasswordModuleNull());
  }),
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
    const api = new Http('http://127.0.0.1:4001/test');
    await api.login({ name: 'test', password: 'password' });
  });
});
