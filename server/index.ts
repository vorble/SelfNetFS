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
import { ServerSessionManager, ServerSession } from './session';

let snfs = new SNFSMemory(uuid.v4, new SNFSPasswordModuleHash());
const sessions = new ServerSessionManager();

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

function lookupSession(req, res, next) {
  const { pool } = req.params;
  const session = sessions.lookup(req.cookies[pool]);
  if (session == null) {
    return next(new SNFSError('Expired.'));
  }
  res.locals.session = session;
  next();
}

function lookupFileSystem(req, res, next) {
  const fs = res.locals.session.lookupFileSystem(req.body.fstoken);
  if (fs == null) {
    return next(new SNFSError('File system not found.'));
  }
  res.locals.fs = fs;
  next();
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

app.use((req, res, next) => {
  // TODO: Check what the browser says they'll accept, must be application/json
  if (typeof req.body != 'object') {
    return res.status(400).send({ message: 'Invalid request: missing request body.' });
  }
  res.locals.finish = (response) => {
    fs.writeFileSync('database.json', SNFSMemorySerializer.stringify(snfs));
    return res.status(200).send(response);
  };
  next();
});

// TODO: All endpoints need a try/catch block that passes to next()
app.options('/login', (req, res) => { res.end(); });
app.post('/login', async (req, res, next) => {
  try {
    const finish = res.locals.finish;
    const { name, password } = req.body;
    const ses = await snfs.login({ name, password });
    const session = sessions.create(ses);
    res.cookie(session.pool, session.token, { path: '/' + session.pool, sameSite: 'None', secure: true, expires: session.expires });
    finish({ pool: session.pool });
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/logout', (req, res) => { res.end(); });
app.post('/:pool/logout', async (req, res, next) => {
  try {
    const finish = res.locals.finish;
    const session = sessions.logout(req.cookies.token);
    if (session == null) {
      throw new SNFSError('Expired.');
    }
    res.clearCookie(session.pool, { path: '/' + session.pool, sameSite: 'None', secure: true, expires: session.expires });
    finish({});
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/resume', (req, res) => { res.end(); });
app.post('/:pool/resume', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    session.updateExpires();
    res.cookie(session.pool, session.token, { path: '/' + session.pool, sameSite: 'None', secure: true, expires: session.expires });
    finish({});
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/fs', (req, res) => { res.end(); });
app.post('/:pool/fs', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { fs, fstoken } = await session.fs();
    const { name, fsno, limits } = fs;
    finish({ fstoken, name, fsno, limits });
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/useradd', (req, res) => { res.end(); });
app.post('/:pool/useradd', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { options } = req.body;
    finish(await session.session.useradd(options));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/usermod', (req, res) => { res.end(); });
app.post('/:pool/usermod', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { name, options } = req.body;
    finish(await session.session.usermod(name, options));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/userdel', (req, res) => { res.end(); });
app.post('/:pool/userdel', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { name } = req.body;
    await session.session.userdel(name);
    finish({});
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/userlist', (req, res) => { res.end(); });
app.post('/:pool/userlist', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    finish(await session.session.userlist());
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/fsadd', (req, res) => { res.end(); });
app.post('/:pool/fsadd', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { options } = req.body;
    finish(await session.session.fsadd(options));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/fsmod', (req, res) => { res.end(); });
app.post('/:pool/fsmod', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { fsno, options } = req.body;
    finish(await session.session.fsmod(fsno, options));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/fsdel', (req, res) => { res.end(); });
app.post('/:pool/fsdel', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { fsno } = req.body;
    await session.session.fsdel(fsno);
    finish({});
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/fslist', (req, res) => { res.end(); });
app.post('/:pool/fslist', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    finish(await session.session.fslist());
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/fsget', (req, res) => { res.end(); });
app.post('/:pool/fsget', lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { fsno, options } = req.body;
    const { fs, fstoken } = await session.fsget(fsno, options);
    const { name, limits } = fs;
    finish({ fstoken, name, fsno, limits });
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/readdir', (req, res) => { res.end(); });
app.post('/:pool/readdir', lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    finish(await fs.readdir(path));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/stat', (req, res) => { res.end(); });
app.post('/:pool/stat', lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    const result = await fs.stat(path);
    finish({
      ...result,
      ctime: result.ctime.getTime(),
      mtime: result.mtime.getTime(),
    });
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/writefile', (req, res) => { res.end(); });
app.post('/:pool/writefile', lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path, data, options } = req.body;
    finish(await fs.writefile(path, Buffer.from(data, 'base64'), options));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/readfile', (req, res) => { res.end(); });
app.post('/:pool/readfile', lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    const result = await fs.readfile(path);
    // TODO: Typescript isn't happy because Uint8Array toString() method doesn't take an argument.
    const facade: any = result.data;
    finish({
      ...result,
      data: facade.toString('base64'),
    });
  } catch(err) {
    next(err);
  }
});

app.options('/:pool/unlink', (req, res) => { res.end(); });
app.post('/:pool/unlink', lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    finish(await fs.unlink(path));
  } catch (err) {
    next(err);
  }
});

app.options('/:pool/move', (req, res, next) => { res.end(); });
app.post('/:pool/move', lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path, newpath } = req.body;
    finish(await fs.move(path, newpath));
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).send({ message: 'Invalid endpoint.' });
});

app.use((err, req, res, next) => {
  if (err instanceof SNFSError) {
    return res.status(400).send({ message: err.message });
  }
  console.error(err);
  return res.status(500).send({ message: 'Internal server error.' });
});

var server = app.listen(4000, () => {
   var host = server.address().address;
   var port = server.address().port;
   console.log("Listening on http://%s:%s", host.indexOf(':') >= 0 ? '[' + host + ']' : host, port);
});
