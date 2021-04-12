export abstract class Logger {
  abstract error(...args: any[]): void;
  abstract log(...args: any[]): void;
}

export class LoggerConsole {
  error(...args: any[]): void {
    console.error(...args);
  }

  log(...args: any[]): void {
    console.log(...args);
  }
}
