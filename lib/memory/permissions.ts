export interface PermissionRecordDescriptor {
  userno: string;
  fsno: string;
}

// TODO: Do I want flags or some enum values since writeable should imply unionable.
export interface PermissionRecord extends PermissionRecordDescriptor {
  unionable: boolean; // TODO: I think I would prefer readable as the name for this field.
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
    const index = this._permissions.findIndex((p: PermissionRecord) => p.userno == record.userno && p.fsno == record.fsno);
    if (index >= 0) {
      this._permissions[index] = { ...record };
    } else {
      this._permissions.push({ ...record });
    }
    // XXX: Should delete from the permissions list when all permissions are false.
  }

  get(desc: PermissionRecordDescriptor): PermissionRecord {
    const p = this._permissions.find((p: PermissionRecord) => p.userno == desc.userno && p.fsno == desc.fsno);
    if (p != null) {
      return { ...p };
    }
    return {
      ...desc,
      unionable: false,
      writeable: false,
    };
  }
}
