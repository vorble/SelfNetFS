import * as shlex from 'shlex';
import { Command } from './command';
import { Http } from 'selfnetfs';
import { SNFS } from 'selfnetfs-common';

interface ShellAdaptor {
  log: (text: string) => void;
  promptText: (prompt: string) => Promise<string | null>;
  promptPassword: () => Promise<string | null>
}

export class ShellUnterminatedCommandError extends Error {}

export class Shell {
  private adaptor: ShellAdaptor;
  private commands: Map<string, Command>;
  private owners: Map<string, SNFS>;
  private currentOwner: SNFS | null;

  constructor(adaptor: ShellAdaptor) {
    this.adaptor = adaptor;
    this.commands = new Map<string, Command>();
    this.commands.set('connect', { exec: this.cmdConnect.bind(this) });
    this.owners = new Map<string, SNFS>();
    this.currentOwner = null;
  }

  getPromptText(): string {
    return '$ ';
  }

  log(text: string) {
    this.adaptor.log(text);
  }

  async run(command: string) {
    try {
      const args = shlex.split(command);
      await this.exec(args);
    } catch (err) {
      if (err.message == 'Got EOF while in a quoted string') {
        throw new ShellUnterminatedCommandError();
      } else if (err.message == 'Got EOF while in an escape sequence') {
        throw new ShellUnterminatedCommandError();
      } else {
        throw err;
      }
    }
  }

  async exec(args: Array<string>) {
    if (args.length == 0) {
      return;
    }

    const cmd = this.commands.get(args[0]);
    if (cmd == null) {
      this.adaptor.log(`snfs: ${ args[0] }: command not found`);
      return;
    }

    await cmd.exec(args);
  }

  async cmdConnect(args: Array<string>): Promise<void> {
    const api = new Http('http://127.0.0.1:4000');
    const username = await this.adaptor.promptText('Username: ');
    if (username == null) {
      return;
    }
    const password = await this.adaptor.promptPassword();
    if (password == null) {
      return;
    }
    const ses = await api.login({ name: username, password: password });
  }
}
