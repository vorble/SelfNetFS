import Persist from './persist';
import { SNFS } from 'selfnetfs-common';
import { Memory } from 'selfnetfs-memory';

export class OwnerPool<T extends SNFS> {
  private persist: Persist;
  private owners: Map<string, T>;
  private ownerFactory: () => T;
  private nullOwner: T;

  constructor(persist: Persist, ownerFactory: () => T) {
    this.persist = persist;
    this.owners = new Map<string, T>();
    this.ownerFactory = ownerFactory;
    this.nullOwner = ownerFactory();
  }

  lookup(owner: string): T {
    const snfs = this.owners.get(owner);
    if (snfs == null) {
      // TODO: Avoid type cast!
      const snfs2 = this.persist.load(owner, () => this.ownerFactory() as unknown as Memory) as unknown as T;
      if (snfs2 != null) {
        this.owners.set(owner, snfs2);
        return snfs2;
      }
      return this.nullOwner;
    }
    return snfs;
  }

  save(owner: string, snfs: T) {
    // TODO: Avoid type cast!
    this.persist.save(owner, snfs as unknown as Memory);
  }
}

export default OwnerPool;
