import bodyParser = require('body-parser');
import cookieParser = require('cookie-parser');
import express = require('express');
import uuid = require('uuid');

import {
  SNFSMemory,
  SNFSPasswordModule,
} from '../lib/memory';
import {
  SNFSError,
  SNFSSession,
  SNFSFileSystem,
} from '../lib/snfs';
import { SNFSPasswordModuleHash } from './password';
import Persist from './persist';
import { ServerSessionManager, ServerSession } from './session';

const persist = new Persist('./database');
const sessions = new ServerSessionManager();
const owners = new Map<string, SNFSMemory>();
const null_owner = new SNFSMemory(uuid.v4, new SNFSPasswordModuleHash());

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
  const snfs = new SNFSMemory(uuid.v4, new SNFSPasswordModuleHash());
  snfs.bootstrap(name, password);
  persist.save(owner, snfs);
  console.log(`A database file for ${ owner } has been created.`);
  console.log('hint: unset HISTFILE');
  process.exit(0);
}

function lookupOwner(req, res, next) {
  const { owner } = req.params;
  let snfs = owners.get(owner);
  if (snfs == null) {
    snfs = persist.load(owner, () => new SNFSMemory(uuid.v4, new SNFSPasswordModuleHash()));
    owners.set(owner, snfs);
  }
  if (snfs == null) {
    snfs = null_owner;
  }
  res.locals.snfs = snfs;
  next();
}

function lookupSession(req, res, next) {
  try {
    const { pool } = req.params;
    const session = sessions.lookup(res.locals.snfs, pool, req.cookies[pool]);
    res.locals.session = session;
    next();
  } catch (err) {
    next(err);
  }
}

async function lookupFileSystem(req, res, next) {
  try {
    const fs = await res.locals.session.lookupFileSystem(req.body.fstoken);
    res.locals.fs = fs;
    next();
  } catch (err) {
    next(err);
  }
}

const app = express();

app.use(cookieParser());

app.use(bodyParser.json());

app.use((req, res, next) => {
  // If origin on the request is missing, then * is used which will cause the browser
  // to complain and reject the response.
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use((req, res, next) => {
  if (req.method === 'POST') {
    if (req.headers.accept !== 'application/json') {
      return res.status(400).send({ message: 'Accept header must be application/json.' });
    }
    if (typeof req.body !== 'object') {
      return res.status(400).send({ message: 'Invalid request: missing request body.' });
    }
    res.locals.finish = (response) => {
      persist.save(req.params.owner, res.locals.snfs);
      return res.status(200).send(response == null ? {} : response);
    };
  }
  next();
});

app.options('/:owner/login', (req, res) => { res.end(); });
app.post('/:owner/login', lookupOwner, async (req, res, next) => {
  try {
    const finish = res.locals.finish;
    const { name, password } = req.body;
    const ses = await res.locals.snfs.login({ name, password });
    const session = sessions.create(ses);
    res.cookie(session.pool, session.token, { path: '/' + req.params.owner + '/' + session.pool, sameSite: 'None', secure: true, expires: session.expires });
    finish({ pool: session.pool });
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/logout', (req, res) => { res.end(); });
app.post('/:owner/:pool/logout', lookupOwner, async (req, res, next) => {
  try {
    const finish = res.locals.finish;
    res.clearCookie(req.params.pool, { path: '/' + req.params.owner + '/' + req.params.pool, sameSite: 'None', secure: true, maxAge: 0 });
    finish({});
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/resume', (req, res) => { res.end(); });
app.post('/:owner/:pool/resume', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    session.updateExpires();
    res.cookie(session.pool, session.token, { path: '/' + req.params.owner + '/' + session.pool, sameSite: 'None', secure: true, expires: session.expires });
    finish({});
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/fs', (req, res) => { res.end(); });
app.post('/:owner/:pool/fs', lookupOwner, lookupSession, async (req, res, next) => {
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

app.options('/:owner/:pool/useradd', (req, res) => { res.end(); });
app.post('/:owner/:pool/useradd', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { options } = req.body;
    finish(await session.session.useradd(options));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/usermod', (req, res) => { res.end(); });
app.post('/:owner/:pool/usermod', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { userno, options } = req.body;
    finish(await session.session.usermod(userno, options));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/userdel', (req, res) => { res.end(); });
app.post('/:owner/:pool/userdel', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { userno } = req.body;
    finish(await session.session.userdel(userno));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/userlist', (req, res) => { res.end(); });
app.post('/:owner/:pool/userlist', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    finish(await session.session.userlist());
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/fsadd', (req, res) => { res.end(); });
app.post('/:owner/:pool/fsadd', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { options } = req.body;
    finish(await session.session.fsadd(options));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/fsmod', (req, res) => { res.end(); });
app.post('/:owner/:pool/fsmod', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { fsno, options } = req.body;
    finish(await session.session.fsmod(fsno, options));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/fsdel', (req, res) => { res.end(); });
app.post('/:owner/:pool/fsdel', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    const { fsno } = req.body;
    finish(await session.session.fsdel(fsno));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/fslist', (req, res) => { res.end(); });
app.post('/:owner/:pool/fslist', lookupOwner, lookupSession, async (req, res, next) => {
  try {
    const session: ServerSession = res.locals.session;
    const finish = res.locals.finish;
    finish(await session.session.fslist());
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/fsget', (req, res) => { res.end(); });
app.post('/:owner/:pool/fsget', lookupOwner, lookupSession, async (req, res, next) => {
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

app.options('/:owner/:pool/readdir', (req, res) => { res.end(); });
app.post('/:owner/:pool/readdir', lookupOwner, lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    finish(await fs.readdir(path));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/stat', (req, res) => { res.end(); });
app.post('/:owner/:pool/stat', lookupOwner, lookupSession, lookupFileSystem, async (req, res, next) => {
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

app.options('/:owner/:pool/writefile', (req, res) => { res.end(); });
app.post('/:owner/:pool/writefile', lookupOwner, lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path, data, options } = req.body;
    finish(await fs.writefile(path, Buffer.from(data, 'base64'), options));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/readfile', (req, res) => { res.end(); });
app.post('/:owner/:pool/readfile', lookupOwner, lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    const result = await fs.readfile(path);
    finish({
      ...result,
      data: Buffer.from(result.data).toString('base64'),
    });
  } catch(err) {
    next(err);
  }
});

app.options('/:owner/:pool/unlink', (req, res) => { res.end(); });
app.post('/:owner/:pool/unlink', lookupOwner, lookupSession, lookupFileSystem, async (req, res, next) => {
  try {
    const fs: SNFSFileSystem = res.locals.fs;
    const finish = res.locals.finish;
    const { path } = req.body;
    finish(await fs.unlink(path));
  } catch (err) {
    next(err);
  }
});

app.options('/:owner/:pool/move', (req, res, next) => { res.end(); });
app.post('/:owner/:pool/move', lookupOwner, lookupSession, lookupFileSystem, async (req, res, next) => {
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
