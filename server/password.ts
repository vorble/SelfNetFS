import crypto = require('crypto');
import { SNFSPasswordModule } from '../src/SNFSMemory';

const NULL_SHA512_SALT = Buffer.alloc(16);

export class SNFSPasswordModuleHash extends SNFSPasswordModule {
  hash(password: string): string {
    return this.hash_sha512(password);
  }

  hash_sha512(password: string): string {
    const alg = 'sha512';
    const iterations = 2048;
    const keylen = 32;
    const salt = crypto.randomBytes(NULL_SHA512_SALT.length);
    const hashed = crypto.pbkdf2Sync(password, salt, iterations, keylen, alg);
    return [alg, iterations.toString(), keylen.toString(), salt.toString('hex'), hashed.toString('hex')].join('$');
  }

  check(password: string, hash: string): boolean {
    const alg = hash.split('$')[0];
    switch (alg) {
      case 'sha512': return this.check_sha512(password, hash);
    }
    this.hash(password); // Waste some time if the algorithm is unknown.
    return false;
  }

  check_sha512(password: string, hash: string): boolean {
    const alg = 'sha512';
    let iterations = null;
    let keylen = null;
    let salt = null;
    let hashed = null;
    let challenge = null;
    const parts = hash.split('$');
    if (parts.length != 5) {
      iterations = 2048;
      keylen = 32;
      salt = NULL_SHA512_SALT;
      hashed = crypto.pbkdf2Sync(password, salt, iterations, keylen, alg);
      challenge = hashed;
    } else {
      iterations = Number(parts[1]);
      keylen = Number(parts[2]);
      salt = Buffer.from(parts[3], 'hex');
      hashed = Buffer.from(parts[4], 'hex');
      challenge = crypto.pbkdf2Sync(password, salt, iterations, keylen, alg);
    }
    let accept = hashed.length == challenge.length;
    for (let i = 0; i < hashed.length && i < challenge.length; ++i) {
      if (hashed[i] != challenge[i]) {
        accept = false;
      }
    }
    return accept;
  }
}
