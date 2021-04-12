import * as net from 'net';
import bodyParser = require('body-parser');
import cookieParser = require('cookie-parser');
import express = require('express');
import {
  FileSystem,
  SNFS,
  SNFSError,
  Session,
  GrantOptions,
} from 'selfnetfs-common';
import {
  Memory,
} from 'selfnetfs-memory';
import { PasswordModuleHash } from './password';
import { ServerSessionManager, ServerSession } from './session';
import { Logger } from './log';
import { PersistBase } from './persist';
export { PersistMemory, PersistMemoryDump } from './persist';

interface ServerOptions<T extends SNFS> {
  port: number;
  persist: PersistBase;
  logger: Logger;
}

export class Server {
  private port: number;
  private sessions: ServerSessionManager;
  private persist: PersistBase;
  private logger: Logger;
  private app: express.Application;
  private server: null | net.Server;

  constructor(options: ServerOptions<SNFS>) {
    this.port = options.port;
    this.sessions = new ServerSessionManager();
    this.persist = options.persist;
    this.logger = options.logger;
    this.app = express();
    this.server = null;

    this.app.use(cookieParser());

    this.app.use(bodyParser.json());

    this.app.use((req, res, next) => {
      // If origin on the request is missing, then * is used which will cause the browser
      // to complain and reject the response.
      const origin = req.headers.origin || '*';
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Accept');
      res.header('Access-Control-Allow-Credentials', 'true');
      next();
    });

    this.app.use((req, res, next) => {
      if (req.method === 'POST') {
        if (req.headers.accept !== 'application/json') {
          return res.status(400).send({ message: 'Accept header must be application/json.' });
        }
        if (typeof req.body !== 'object') {
          return res.status(400).send({ message: 'Invalid request: missing request body.' });
        }
        // TODO: Don't need this finish callback anymore.
        res.locals.finish = (response: any) => {
          return res.status(200).send(response == null ? {} : response);
        };
      }
      next();
    });

    this.app.options('/:owner/login', (req, res) => { res.end(); });
    this.app.post('/:owner/login', this.lookupOwner.bind(this), async (req, res, next) => {
      try {
        const { name, password } = req.body;
        if (typeof name !== 'string') {
          throw new SNFSError('name must be a string.');
        }
        if (typeof password !== 'string') {
          throw new SNFSError('password must be a string.');
        }
        const ses = await res.locals.snfs.login({
          name: name as string,
          password: password as string
        });
        const session = this.sessions.create(ses);
        res.cookie(session.pool, session.token, { path: '/' + req.params.owner + '/' + session.pool, sameSite: 'none', secure: true, expires: session.expires });
        res.locals.finish({ pool: session.pool, userno: ses.info().userno });
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/resume', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/resume', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        session.updateExpires();
        res.cookie(session.pool, session.token, { path: '/' + req.params.owner + '/' + session.pool, sameSite: 'none', secure: true, expires: session.expires });
        res.locals.finish({
          userno: session.session.info().userno,
        });
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/sesdetail', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/sesdetail', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        res.locals.finish(await session.session.detail());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/logout', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/logout', this.lookupOwner.bind(this), async (req, res, next) => {
      try {
        res.clearCookie(req.params.pool, { path: '/' + req.params.owner + '/' + req.params.pool, sameSite: 'none', secure: true, maxAge: 0 });
        res.locals.finish({});
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/useradd', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/useradd', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { options } = req.body;
        if (typeof options !== 'object') {
          throw new SNFSError('options must be an object.');
        }
        if (typeof options.name !== 'string') {
          throw new SNFSError('options.name must be a string.');
        }
        if (typeof options.password !== 'string') {
          throw new SNFSError('options.password must be a string.');
        }
        if (typeof options.admin !== 'undefined' && typeof options.admin !== 'boolean') {
          throw new SNFSError('options.admin must be a boolean.');
        }
        if (typeof options.fs !== 'undefined' && typeof options.fs !== 'string' && options.fs !== null) {
          throw new SNFSError('options.fs must be a string or null.');
        }
        if (typeof options.union !== 'undefined' && !Array.isArray(options.union)) {
          throw new SNFSError('options.union must be an array of strings.');
        }
        if (typeof options.union !== 'undefined') {
          for (const ufsno of options.union) {
            if (typeof ufsno !== 'string') {
              throw new SNFSError('options.union must be an array of strings.');
            }
          }
        }
        const use_options = {
          name: options.name as string,
          password: options.password as string,
          admin: options.admin as boolean | undefined,
          fs: options.fs as string | undefined,
          union: typeof options.union == 'undefined' ? undefined : options.union.map((u: any) => u as string),
        };
        res.locals.finish(await session.session.useradd(use_options));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/usermod', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/usermod', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { userno, options } = req.body;
        if (typeof userno !== 'string') {
          throw new SNFSError('userno must be a string.');
        }
        if (typeof options !== 'object') {
          throw new SNFSError('options must be an object.');
        }
        if (typeof options.name !== 'undefined' && typeof options.name !== 'string') {
          throw new SNFSError('options.name must be a string.');
        }
        if (typeof options.password !== 'undefined' && typeof options.password !== 'string') {
          throw new SNFSError('options.password must be a string.');
        }
        if (typeof options.admin !== 'undefined' && typeof options.admin !== 'boolean') {
          throw new SNFSError('options.admin must be a boolean.');
        }
        if (typeof options.fs !== 'undefined' && typeof options.fs !== 'string' && options.fs !== null) {
          throw new SNFSError('options.fs must be a string or null.');
        }
        if (typeof options.union !== 'undefined' && !Array.isArray(options.union)) {
          throw new SNFSError('options.union must be an array of strings.');
        }
        if (typeof options.union !== 'undefined') {
          for (const ufsno of options.union) {
            if (typeof ufsno !== 'string') {
              throw new SNFSError('options.union must be an array of strings.');
            }
          }
        }
        const use_options = {
          name: options.name as string | undefined,
          password: options.password as string | undefined,
          admin: options.admin as boolean | undefined,
          fs: options.fs as string | null | undefined,
          union: typeof options.union == 'undefined' ? undefined : options.union.map((u: any) => u as string),
        };
        res.locals.finish(await session.session.usermod(userno as string, use_options));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/userdel', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/userdel', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { userno } = req.body;
        if (typeof userno !== 'string') {
          throw new SNFSError('userno must be a string.');
        }
        res.locals.finish(await session.session.userdel(userno as string));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/userlist', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/userlist', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        res.locals.finish(await session.session.userlist());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fs', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fs', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const fs = await session.session.fs();
        res.locals.finish(fs.info());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fsget', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fsget', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { fsno, options } = req.body;
        if (typeof fsno !== 'string') {
          throw new SNFSError('fsno must be a string.');
        }
        if (typeof options !== 'undefined') {
          if (typeof options !== 'object') {
            throw new SNFSError('options must be an object.');
          }
          if (typeof options.writeable !== 'undefined' && typeof options.writeable !== 'boolean') {
            throw new SNFSError('options.writeable must be a boolean.');
          }
          if (typeof options.union !== 'undefined' && !Array.isArray(options.union)) {
            throw new SNFSError('options.union must be an array of strings.');
          }
          if (typeof options.union !== 'undefined') {
            for (const ufsno of options.union) {
              if (typeof ufsno !== 'string') {
                throw new SNFSError('options.union must be an array of strings.');
              }
            }
          }
        }
        const use_options = typeof options === 'undefined' ? undefined : {
          writeable: options.writeable as boolean,
          union: typeof options.union === 'undefined' ? undefined : options.union.map((u: any) => u as string),
        };
        const fs = await session.session.fsget(fsno as string, use_options);
        res.locals.finish(fs.info());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fsresume', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fsresume', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        res.locals.finish(fs.info());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fsadd', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fsadd', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { options } = req.body;
        if (typeof options !== 'object') {
          throw new SNFSError('options must be an object.');
        }
        if (typeof options.name !== 'string') {
          throw new SNFSError('options.name must be a string.');
        }
        if (typeof options.max_files !== 'undefined' && typeof options.max_files !== 'number') {
          throw new SNFSError('options.max_files must be a number.');
        }
        if (typeof options.max_storage !== 'undefined' && typeof options.max_storage !== 'number') {
          throw new SNFSError('options.max_storage must be a number.');
        }
        if (typeof options.max_depth !== 'undefined' && typeof options.max_depth !== 'number') {
          throw new SNFSError('options.max_depth must be a number.');
        }
        if (typeof options.max_path !== 'undefined' && typeof options.max_path !== 'number') {
          throw new SNFSError('options.max_path must be a number.');
        }
        const use_options = {
          name: options?.name as string,
          max_files: options?.max_files as number,
          max_storage: options?.max_storage as number,
          max_depth: options?.max_depth as number,
          max_path: options.max_path as number,
        };
        res.locals.finish(await session.session.fsadd(options));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fsmod', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fsmod', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { fsno, options } = req.body;
        if (typeof fsno !== 'string') {
          throw new SNFSError('fsno must be a string.');
        }
        if (typeof options !== 'object') {
          throw new SNFSError('options must be an object.');
        }
        if (typeof options.name !== 'undefined' && typeof options.name !== 'string') {
          throw new SNFSError('options.name must be a string.');
        }
        if (typeof options.max_files !== 'undefined' && typeof options.max_files !== 'number') {
          throw new SNFSError('options.max_files must be a number.');
        }
        if (typeof options.max_storage !== 'undefined' && typeof options.max_storage !== 'number') {
          throw new SNFSError('options.max_storage must be a number.');
        }
        if (typeof options.max_depth !== 'undefined' && typeof options.max_depth !== 'number') {
          throw new SNFSError('options.max_depth must be a number.');
        }
        if (typeof options.max_path !== 'undefined' && typeof options.max_path !== 'number') {
          throw new SNFSError('options.max_path must be a number.');
        }
        const use_options = {
          name: options?.name as string,
          max_files: options?.max_files as number,
          max_storage: options?.max_storage as number,
          max_depth: options?.max_depth as number,
          max_path: options.max_path as number,
        };
        res.locals.finish(await session.session.fsmod(fsno as string, use_options));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fsdel', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fsdel', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { fsno } = req.body;
        if (typeof fsno !== 'string') {
          throw new SNFSError('fsno must be a string.');
        }
        res.locals.finish(await session.session.fsdel(fsno as string));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fslist', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fslist', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        res.locals.finish(await session.session.fslist());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/grant', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/grant', this.lookupOwner.bind(this), this.lookupSession.bind(this), async (req, res, next) => {
      try {
        const session: ServerSession = res.locals.session;
        const { userno, options } = req.body;
        if (typeof userno !== 'string') {
          throw new SNFSError('userno must be a string.');
        }
        function isGrantOptions(o: any) {
          if (typeof o !== 'object') {
            throw new SNFSError('option must be an object.');
          }
          if (typeof o.fsno !== 'string') {
            throw new SNFSError('options.fsno must be a string.');
          }
          if (typeof o.readable !== 'boolean') {
            throw new SNFSError('options.readable must be a boolean.');
          }
          if (typeof o.writeable !== 'boolean') {
            throw new SNFSError('options.writeable must be a boolean.');
          }
          return {
            fsno: o.fsno,
            readable: o.readable,
            writeable: o.writeable,
          };
        }
        let use_options: GrantOptions | GrantOptions[] = [];
        if (Array.isArray(options)) {
          for (const o of options) {
            use_options.push(isGrantOptions(o));
          }
        } else {
          if (typeof options !== 'object') {
            throw new SNFSError('options must be an object.');
          }
          use_options = isGrantOptions(options);
        }
        res.locals.finish(await session.session.grant(userno as string, use_options));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/fsdetail', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/fsdetail', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        res.locals.finish(await fs.detail());
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/readdir', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/readdir', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        const { path } = req.body;
        if (typeof path !== 'string') {
          throw new SNFSError('path must be a string.');
        }
        res.locals.finish(await fs.readdir(path as string));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/stat', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/stat', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        const { path } = req.body;
        if (typeof path !== 'string') {
          throw new SNFSError('path must be a string.');
        }
        const result = await fs.stat(path as string);
        res.locals.finish({
          ...result,
          ctime: result.ctime.getTime(),
          mtime: result.mtime.getTime(),
        });
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/writefile', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/writefile', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        const { path, data, options } = req.body;
        if (typeof path !== 'string') {
          throw new SNFSError('path must be a string.');
        }
        if (typeof data !== 'string') {
          throw new SNFSError('data must be a string.');
        }
        if (typeof options !== 'undefined') {
          if (typeof options.truncate !== 'undefined' && typeof options.truncate !== 'boolean') {
            throw new SNFSError('options.truncate must be a boolean.');
          }
        }
        const use_options = {
          truncate: options?.truncate as boolean,
        };
        res.locals.finish(await fs.writefile(path as string, Buffer.from(data as string, 'base64'), use_options));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/readfile', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/readfile', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        const { path } = req.body;
        if (typeof path !== 'string') {
          throw new SNFSError('path must be a string.');
        }
        const result = await fs.readfile(path as string);
        res.locals.finish({
          ...result,
          data: Buffer.from(result.data).toString('base64'),
        });
      } catch(err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/unlink', (req, res) => { res.end(); });
    this.app.post('/:owner/:pool/unlink', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        const { path } = req.body;
        if (typeof path !== 'string') {
          throw new SNFSError('path must be a string.');
        }
        res.locals.finish(await fs.unlink(path as string));
      } catch (err) {
        next(err);
      }
    });

    this.app.options('/:owner/:pool/move', (req, res, next) => { res.end(); });
    this.app.post('/:owner/:pool/move', this.lookupOwner.bind(this), this.lookupSession.bind(this), this.lookupFileSystem.bind(this), async (req, res, next) => {
      try {
        const fs: FileSystem = res.locals.fs;
        const { path, newpath } = req.body;
        if (typeof path !== 'string') {
          throw new SNFSError('path must be a string.');
        }
        if (typeof newpath !== 'string') {
          throw new SNFSError('newpath must be a string.');
        }
        res.locals.finish(await fs.move(path as string, newpath as string));
      } catch (err) {
        next(err);
      }
    });

    this.app.use((req, res) => {
      res.status(404).send({ message: 'Invalid endpoint.' });
    });

    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err instanceof SNFSError) {
        return res.status(400).send({ message: err.message });
      }
      this.logger.error(err);
      return res.status(500).send({ message: 'Internal server error.' });
    });
  }

  lookupOwner(req: express.Request, res: express.Response, next: express.NextFunction) {
    const { owner } = req.params;
    res.locals.snfs = this.persist.getSNFSForOwner(owner);
    next();
  }

  lookupSession(req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
      const { pool } = req.params;
      const session = this.sessions.lookup(res.locals.snfs, pool, req.cookies[pool]);
      res.locals.session = session;
      next();
    } catch (err) {
      next(err);
    }
  }

  async lookupFileSystem(req: express.Request, res: express.Response, next: express.NextFunction) {
    try {
      const { fs_token } = req.body;
      if (typeof fs_token !== 'string') {
        throw new SNFSError('fs_token must be a string.');
      }
      const fs = await res.locals.session.session.fsresume(fs_token as string);
      res.locals.fs = fs;
      next();
    } catch (err) {
      next(err);
    }
  }

  listen(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const server = this.app.listen(this.port, () => {
          this.server = server;
          try {
            const address = server.address();
            if (address == null) {
              this.logger.log('Listening');
            } else if (typeof address === 'string') {
              this.logger.log('Listening on http://' + address);
            } else {
              const host = address.address;
              const port = address.port;
              this.logger.log('Listening on http://%s:%s', host.indexOf(':') >= 0 ? '[' + host + ']' : host, port);
            }
          } finally {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  destroy() {
    if (this.server != null) {
      this.server.close();
      this.server = null;
    }
  }
}

export default Server;
