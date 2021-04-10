export interface PermissionRecordDescriptor {
  userno: string;
  fsno: string;
}

// TODO: Do I want flags or some enum values since writeable should imply readable.
export interface PermissionRecord extends PermissionRecordDescriptor {
  readable: boolean;
  writeable: boolean;
}

export class PermissionSet {
  private _permissions: Array<PermissionRecord>;

  constructor() {
    this._permissions = [];
  }

  userdel(userno: string) {
    this._permissions = this._permissions.filter((p: PermissionRecord) => p.userno != userno);
  }

  set(record: PermissionRecord) {
    if (record.readable || record.writeable) {
      const index = this._permissions.findIndex((p: PermissionRecord) => p.userno == record.userno && p.fsno == record.fsno);
      if (index >= 0) {
        this._permissions[index] = { ...record };
      } else {
        this._permissions.push({ ...record });
      }
    } else {
      this._permissions = this._permissions.filter((p: PermissionRecord) => p.userno != record.userno || p.fsno != record.fsno);
    }
  }

  get(desc: PermissionRecordDescriptor): PermissionRecord {
    const p = this._permissions.find((p: PermissionRecord) => p.userno == desc.userno && p.fsno == desc.fsno);
    if (p != null) {
      return { ...p };
    }
    return {
      ...desc,
      readable: false,
      writeable: false,
    };
  }
}
