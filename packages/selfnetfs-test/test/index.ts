import 'mocha';
import * as uuid from 'uuid';
import * as assert from 'assert';
import { Http } from 'selfnetfs';
import { FileSystem, Session, SNFS } from 'selfnetfs-common';
import { Memory, PasswordModuleNull } from 'selfnetfs-memory';
import { Server, PersistMemory } from 'selfnetfs-server';

export class LoggerNull {
  error(...args: any[]): void {}
  log(...args: any[]): void {}
}

function tenc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function tdec(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

const PARAMS = {
  DEFAULT_OWNER: 'owner',
  DEFAULT_USERNAME: 'user',
  DEFAULT_PASSWORD: 'password',
};

const implementations = [
  {
    server: ((): null | Server => {
      return null;
    })(),
    name: 'Http',
    setup: async function() {
      const persist = new PersistMemory();
      persist.bootstrap(PARAMS.DEFAULT_OWNER, PARAMS.DEFAULT_USERNAME, PARAMS.DEFAULT_PASSWORD);
      this.server = new Server({
        port: 4001,
        persist: persist,
        logger: new LoggerNull(),
        secure: false, // Since there's no TLS.
      });
      await this.server.listen();
    },
    factory: function(owner: string) {
      return new Http('http://127.0.0.1:4001/' + owner);
    },
    shutdown: async function() {
      if (this.server != null) {
        this.server.destroy();
      }
    },
  },

  {
    persist: ((): null | PersistMemory => {
      return null;
    })(),
    name: 'Memory',
    setup: async function() {
      this.persist = new PersistMemory();
      this.persist.bootstrap(PARAMS.DEFAULT_OWNER, PARAMS.DEFAULT_USERNAME, PARAMS.DEFAULT_PASSWORD);
    },
    factory: function(owner: string) {
      if (this.persist != null) {
        return this.persist.getSNFSForOwner(owner);
      }
      throw new Error('Missing persist.');
    },
    shutdown: async function() {
    },
  },
];

for (const impl of implementations) {
  describe('testing ' + impl.name, async function() {
    before(async function() {
      await impl.setup();
    });

    it('log in', async function() {
      const api = impl.factory('owner');
      const ses = await api.login({ name: 'user', password: 'password' });
    });

    describe('basic usage', function() {
      let _api: null | SNFS = null;
      let _ses: null | Session = null;
      let _fs: null | FileSystem = null;

      function state() {
        if (_api == null) {
          throw new Error('Missing api.');
        }
        if (_ses == null) {
          throw new Error('Missing ses.');
        }
        if (_fs == null) {
          throw new Error('Missing fs.');
        }
        return { api: _api, ses: _ses, fs: _fs };
      }

      before(async function() {
        _api = impl.factory('owner');
        _ses = await _api.login({ name: 'user', password: 'password' });
        _fs = await _ses.fs();
      });

      const BASIC_TEST_DATA = 'test data';

      it('writefile', async function() {
        const { api, ses, fs } = state();
        await fs.writefile('/test', tenc(BASIC_TEST_DATA));
      });

      it('readfile', async function() {
        const { api, ses, fs } = state();
        const { data } = await fs.readfile('/test');
        assert.equal(tdec(data), BASIC_TEST_DATA);
      });

      it('stat', async function() {
        const { api, ses, fs } = state();
        const { size } = await fs.stat('/test');
        assert.equal(size, BASIC_TEST_DATA.length);
      });

      after(async function() {
        _api = null;
        _ses = null;
        _fs = null;
      });
    });

    after(async function() {
      await impl.shutdown();
    });
  });
}

// TODO: Implement tests which iterate through the implementations and correlate the result of various actions.
