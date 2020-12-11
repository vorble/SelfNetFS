import bodyParser = require('body-parser');
import cookieParser = require('cookie-parser');
import express = require('express');
import fs = require('fs');
import uuid = require('uuid');

import {
  SNFSMemory,
  SNFSPasswordModule,
} from '../src/SNFSMemory';
import {
  SNFSError,
  SNFSSession,
  SNFSFileSystem,
} from '../src/SNFS';
import { SNFSPasswordModuleHash } from './SNFSPasswordModuleHash';
import SNFSMemorySerializer from './SNFSMemorySerializer';
import { tokengen } from './token';

let snfs = new SNFSMemory(uuid.v4, new SNFSPasswordModuleHash());

try {
  const data = fs.readFileSync('database.json').toString('utf-8');
  SNFSMemorySerializer.parse(data, snfs);
} catch(err) {
  if (err.code != 'ENOENT') {
    console.error(err);
  }
  snfs = new SNFSMemory(uuid.v4, new SNFSPasswordModuleHash());
}

if (process.argv.slice(2).indexOf('--init') >= 0) {
  const argv = process.argv.slice(2);
  const [init, name, password] = argv;
  if (!name) {
    console.log('Please specify the user\'s name.');
    process.exit(1);
  }
  if (!password) {
    console.log('Please specify the user\'s password.');
    process.exit(1);
  }
  // If there's already stuff in the database, this will cause an error.
  snfs.bootstrap(name, password);
  fs.writeFileSync('database.json', SNFSMemorySerializer.stringify(snfs));
  console.log('database.json has been generated with the provided credentials.');
  console.log('hint: unset HISTFILE');
  process.exit(0);
}

const app = express();

app.use(cookieParser());
app.use(bodyParser.json());
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

const handlers = new Map<string, (req, res) => Promise<any>>();
const sessions = new Map<string, SNFSSession>();
const sessionfss = new Map<string, Map<string, SNFSFileSystem>>();

function getSession(token: string): SNFSSession {
  const session = sessions.get(token);
  if (session == null) {
    throw new SNFSError('Not authorized.');
  }
  return session;
}

interface SessionAndFS {
  session: SNFSSession;
  fs: SNFSFileSystem;
}
function getSessionAndFS(token: string, fstoken: string): SessionAndFS {
  const session = sessions.get(token);
  if (session == null) {
    throw new SNFSError('Not authorized.');
  }
  const fss = sessionfss.get(token);
  if (fss == null) {
    throw new Error('Missing fss.'); // Triggers 500 to browser, not SNFSError.
  }
  const fs = fss.get(fstoken);
  if (fs == null) {
    throw new SNFSError('Not authorized.');
  }
  return { session, fs };
}

handlers.set('login', async (req, res) => {
  const { name, password } = req.body;
  const session = await snfs.login({ name, password });
  const token = tokengen();
  sessions.set(token, session);
  sessionfss.set(token, new Map<string, SNFSFileSystem>());
  res.cookie('token', token, { path: '/', sameSite: 'None', secure: true, maxAge: 60 * 60 * 24 * 30 * 1000 });
  return Promise.resolve({ token });
});

handlers.set('resume', async (req, res) => {
  const { token } = req.cookies;
  const session = getSession(token); // Just for the throw if the session isn't authorized.
  res.cookie('token', token, { path: '/', sameSite: 'None', secure: true, maxAge: 60 * 60 * 24 * 30 * 1000 });
  return Promise.resolve({});
});

handlers.set('logout', async (req, res) => {
  const { token } = req.cookies;
  const session = getSession(token); // Just for the throw if the session isn't authorized.
  sessions.delete(token);
  sessionfss.delete(token);
  res.clearCookie('token', { path: '/', sameSite: 'None', secure: true, maxAge: 60 * 60 * 24 * 30 * 1000 });
  return Promise.resolve({});
});

handlers.set('fs', async (req, res) => {
  const { token } = req.cookies;
  const session = getSession(token);
  const fs = await session.fs();
  const fstoken = tokengen();
  const fss = sessionfss.get(token);
  fss.set(fstoken, fs);
  const { name, fsno, limits } = fs;
  return Promise.resolve({ fstoken, name, fsno, limits });
});

handlers.set('useradd', async (req, res) => {
  const { token } = req.cookies;
  const { options } = req.body;
  const session = getSession(token);
  return Promise.resolve(await session.useradd(options));
});

handlers.set('usermod', async (req, res) => {
  const { token } = req.cookies;
  const { name, options } = req.body;
  const session = getSession(token);
  return Promise.resolve(await session.usermod(name, options));
});

handlers.set('userdel', async (req, res) => {
  const { token } = req.cookies;
  const { name } = req.body;
  const session = getSession(token);
  await session.userdel(name);
  return Promise.resolve({});
});

handlers.set('userlist', async (req, res) => {
  const { token } = req.cookies;
  const session = getSession(token);
  return Promise.resolve(await session.userlist());
});

handlers.set('fsadd', async (req, res) => {
  const { token } = req.cookies;
  const { options } = req.body;
  const session = getSession(token);
  return Promise.resolve(await session.fsadd(options));
});

handlers.set('fsmod', async (req, res) => {
  const { token } = req.cookies;
  const { fsno, options } = req.body;
  const session = getSession(token);
  return Promise.resolve(await session.fsmod(fsno, options));
});

handlers.set('fsdel', async (req, res) => {
  const { token } = req.cookies;
  const { fsno } = req.body;
  const session = getSession(token);
  await session.fsdel(fsno);
  return Promise.resolve({});
});

handlers.set('fslist', async (req, res) => {
  const { token } = req.cookies;
  const session = getSession(token);
  return Promise.resolve(await session.fslist());
});

handlers.set('fsget', async (req, res) => {
  const { token } = req.cookies;
  const { fsno, options } = req.body;
  const session = getSession(token);
  const fs = await session.fsget(fsno, options);
  const fstoken = tokengen();
  const fss = sessionfss.get(token);
  fss.set(fstoken, fs);
  {
    const { name, fsno, limits } = fs;
    return Promise.resolve({ fstoken, name, fsno, limits });
  }
});

handlers.set('readdir', async (req, res) => {
  const { token } = req.cookies;
  const { fstoken, path } = req.body;
  const { session, fs } = getSessionAndFS(token, fstoken);
  return Promise.resolve(await fs.readdir(path));
});

handlers.set('stat', async (req, res) => {
  const { token } = req.cookies;
  const { fstoken, path } = req.body;
  const { session, fs } = getSessionAndFS(token, fstoken);
  const result = await fs.stat(path);
  return Promise.resolve({
    ...result,
    ctime: result.ctime.getTime(),
    mtime: result.mtime.getTime(),
  });
});

handlers.set('writefile', async (req, res) => {
  const { token } = req.cookies;
  const { fstoken, path, data, options } = req.body;
  const { session, fs } = getSessionAndFS(token, fstoken);
  return Promise.resolve(await fs.writefile(path, Buffer.from(data, 'base64'), options));
});

handlers.set('readfile', async (req, res) => {
  const { token } = req.cookies;
  const { fstoken, path } = req.body;
  const { session, fs } = getSessionAndFS(token, fstoken);
  const result = await fs.readfile(path);
  // TODO: Typescript isn't happy because Uint8Array toString() method doesn't take an argument.
  const facade: any = result.data;
  return {
    data: facade.toString('base64'),
  };
});

handlers.set('unlink', async (req, res) => {
  const { token } = req.cookies;
  const { fstoken, path } = req.body;
  const { session, fs } = getSessionAndFS(token, fstoken);
  return Promise.resolve(await fs.unlink(path));
});

handlers.set('move', async (req, res) => {
  const { token } = req.cookies;
  const { fstoken, path, newpath } = req.body;
  const { session, fs } = getSessionAndFS(token, fstoken);
  return Promise.resolve(await fs.move(path, newpath));
});

app.options('/api', (req, res) => {
  res.end();
});
app.post('/api', async (req, res) => {
  if (typeof req.body != 'object') {
    return res.status(400).send({ message: 'Invalid request: missing request body.' });
  }
  try {
    const handler = handlers.get(req.body.op);
    if (handler != null) {
      const response = await handler(req, res);
      fs.writeFileSync('database.json', SNFSMemorySerializer.stringify(snfs));
      return res.status(200).send(response);
    }
  } catch (err) {
    if (err instanceof SNFSError) {
      return res.status(400).send({ message: err.message });
    } else {
      console.error(err);
      return res.status(500).send({ message: 'Internal server error.' });
    }
  }
  res.status(400).send({ message: 'Invalid request: unexpected op.' });
});

var server = app.listen(4000, () => {
   var host = server.address().address;
   var port = server.address().port;

   console.log("Listening on http://%s:%s", host.indexOf(':') >= 0 ? '[' + host + ']' : host, port);
});
