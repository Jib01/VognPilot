"use client";

import { useEffect } from 'react';
import { db } from '../lib/db';

const REMOTE_API_URL = process.env.NEXT_PUBLIC_API_URL;

export function useSyncEngine() {
  useEffect(() => {
    if (!REMOTE_API_URL) return;

    const syncData = async () => {
      if (!navigator.onLine) return;

      try {
        const pendingItems = await db.groceryList.where('sync_status').equals('pending').toArray();
        if (pendingItems.length === 0) return;

        const payload = pendingItems.map(item => ({
          ...item,
          quantity: item.quantity || 1,
        }));

        const response = await fetch(`${REMOTE_API_URL}/api/v1/groceries/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Backend sync failed: ${response.status}`);
        }

        for (const item of pendingItems) {
          if (item.id != null) {
            await db.groceryList.update(item.id, { sync_status: 'synced' });
          }
        }
      } catch (error) {
        console.warn('[Sync Engine] Sync deferred:', error);
      }
    };

    window.addEventListener('online', syncData);
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncData();
    }

    return () => window.removeEventListener('online', syncData);
  }, []);
}
