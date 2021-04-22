import * as shlex from 'shlex';
import { Command } from './command';

interface ShellAdaptor {
  log: (text: string) => void;
}

export class ShellUnterminatedCommandError extends Error {}

export class Shell {
  adaptor: ShellAdaptor;
  commands: Map<string, Command>;

  constructor(adaptor: ShellAdaptor) {
    this.adaptor = adaptor;
    this.commands = new Map<string, Command>();
  }

  getPromptText(): string {
    return '$ ';
  }

  log(text: string) {
    this.adaptor.log(text);
  }

  run(command: string) {
    try {
      const args = shlex.split(command);
      this.exec(args);
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

  exec(args: Array<string>) {
    if (args.length == 0) {
      return;
    }

    const cmd = this.commands.get(args[0]);
    if (cmd == null) {
      this.adaptor.log(`snfs: ${ args[0] }: command not found`);
      return;
    }

    cmd.exec(args);
  }
}
