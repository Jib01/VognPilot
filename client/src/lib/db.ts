import Dexie, { Table } from 'dexie';

export interface GroceryItem {
  id?: number;
  uuid: string;
  name: string;
  danish_term: string;
  price_dkk: number;
  price_eur: number;
  quantity: number;
  is_checked: boolean;
  sync_status: 'synced' | 'pending';
  created_at: number;
}

export class VognPilotDB extends Dexie {
  groceryList!: Table<GroceryItem>;

  constructor() {
    super('VognPilotDatabase');
    this.version(1).stores({
      groceryList: '++id, uuid, is_checked, sync_status'
    });
  }
}

export const db = new VognPilotDB();
