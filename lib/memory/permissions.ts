export interface PermissionRecord {
  userno: string;
  fsno: string;
  unionable: boolean;
  writeable: boolean;
}

export class PermissionSet {
  private _permissions: Array<PermissionRecord>;

  constructor() {
    this._permissions = [];
  }

  set(record: PermissionRecord) {
    const existing = this._permissions.find(p => p.userno == record.userno && p.fsno == record.fsno);
  }
}
