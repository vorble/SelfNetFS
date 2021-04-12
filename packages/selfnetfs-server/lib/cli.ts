import * as uuid from 'uuid';
import { Server } from './index';
import { PersistMemoryDump } from './persist';
import { PasswordModuleHash } from './password';
import {
  Memory,
} from 'selfnetfs-memory';

// TODO: The persist and other functional components that are replicated separately here and in
// the Server class should be consolidated somehow.

const persist = new PersistMemoryDump({
  dataDirectory: './database',
});

if (process.argv.slice(2).indexOf('--init') >= 0) {
  const argv = process.argv.slice(2);
  const [init, owner, name, password] = argv;
  if (!owner) {
    console.log('Please specify the owner.');
    process.exit(1);
  } else if (!/^[a-zA-Z0-9_-]+$/.test(owner)) {
    console.log('Invalid characters in owner.');
    process.exit(1);
  }
  if (!name) {
    console.log('Please specify the owner\'s user.');
    process.exit(1);
  }
  if (!password) {
    console.log('Please specify the owner\'s user\'s password.');
    process.exit(1);
  }
  persist.bootstrap(owner, name, password);
  console.log(`A database file for ${ owner } has been created.`);
  console.log('hint: unset HISTFILE');
  process.exit(0);
}

new Server({
  port: 4000,
  persist: persist,
}).listen();
