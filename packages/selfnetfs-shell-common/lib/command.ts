export interface Command {
  exec: (args: Array<string>) => Promise<void>;
}
