import Dexie, { Table } from 'dexie';

export interface GroceryItem {
  id?: number;
  uuid: string;
  name: string;
  danish_term: string;
  price_dkk: number;
  price_eur: number;
  pant_fee_dkk?: number;
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
    this.version(2).stores({
      groceryList: '++id, uuid, is_checked, sync_status, created_at'
    });
  }
}

export const db = new VognPilotDB();
