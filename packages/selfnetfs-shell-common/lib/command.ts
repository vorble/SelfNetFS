export interface Command {
  exec: (args: Array<string>) => void;
}
