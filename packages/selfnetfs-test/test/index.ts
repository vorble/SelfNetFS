import 'mocha';
import { equal } from 'assert';
import { Http } from 'selfnetfs';
import { Memory } from 'selfnetfs-memory';
import { Server } from 'selfnetfs-server';

const server = new Server({ port: 4001 });

describe('testing', () => {
  it('should log in', () => {
    equal(true, true);
  });
});
