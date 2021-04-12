import * as uuid from 'uuid';
import { Server } from './index';
import { PersistMemoryDump } from './persist';
import { PasswordModuleHash } from './password';
import {
  Memory,
} from 'selfnetfs-memory';
import { LoggerConsole } from './log';

const logger = new LoggerConsole();
const persist = new PersistMemoryDump({
  dataDirectory: './database',
  logger,
});

if (process.argv.slice(2).indexOf('--init') >= 0) {
  const argv = process.argv.slice(2);
  const [init, owner, name, password] = argv;
  if (!owner) {
    logger.log('Please specify the owner.');
    process.exit(1);
  } else if (!/^[a-zA-Z0-9_-]+$/.test(owner)) {
    logger.log('Invalid characters in owner.');
    process.exit(1);
  }
  if (!name) {
    logger.log('Please specify the owner\'s user.');
    process.exit(1);
  }
  if (!password) {
    logger.log('Please specify the owner\'s user\'s password.');
    process.exit(1);
  }
  persist.bootstrap(owner, name, password);
  logger.log(`A database file for ${ owner } has been created.`);
  logger.log('hint: unset HISTFILE');
  process.exit(0);
}

new Server({
  port: 4000,
  persist,
  logger,
}).listen();
