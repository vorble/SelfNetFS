import * as readline from 'readline';
import { Shell, ShellUnterminatedCommandError } from 'selfnetfs-shell-common';
import * as pkg from '../package.json';

const adaptor = {
  log: (text: string) => {
    console.log(text);
  },
  write: (text: string) => { // TODO: Do I need this?
    process.stdout.write(text);
  },
  error: (thing: any) => { // TODO: Do I really need this?
    console.error(thing);
  },
};

adaptor.log('SelfNetFS Shell v' + pkg.version);

const shell = new Shell(adaptor);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.setPrompt(shell.getPromptText());
rl.prompt();

let lineParts: Array<string> = [];

rl.on('line', (line: string) => {
  try {
    if (lineParts.length > 0) {
      const newLine = lineParts.join('\n') + '\n' + line;
      shell.run(newLine);
      lineParts.length = 0;
    } else {
      shell.run(line);
    }

    rl.setPrompt(shell.getPromptText());
    rl.prompt();
  } catch(err) {
    if (err instanceof ShellUnterminatedCommandError) {
      lineParts.push(line);
      rl.setPrompt('> ');
      rl.prompt();
    } else {
      adaptor.error(err);
    }
  }
});

rl.on('SIGINT', function() {
  if (lineParts.length > 0) {
    lineParts.length = 0;
    rl.setPrompt(shell.getPromptText());
    rl.prompt();
  } else {
    adaptor.log('^C');
    rl.setPrompt(shell.getPromptText());
    rl.prompt();
  }
});
