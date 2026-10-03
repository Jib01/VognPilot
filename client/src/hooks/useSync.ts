"use client";

import { useEffect } from 'react';
import { db } from '../lib/db';

export function useSyncEngine() {
  useEffect(() => {
    const syncData = async () => {
      // Offline check
      if (!navigator.onLine) return;
      
      try {
        const pendingItems = await db.groceryList.where('sync_status').equals('pending').toArray();
        if (pendingItems.length === 0) return;

        console.log(`[Sync Engine] Found ${pendingItems.length} pending items. Pushing to backend...`);
        
        // Sanitize legacy items that might be missing 'quantity'
        const payload = pendingItems.map(item => ({
           ...item,
           quantity: item.quantity || 1
        }));

        const response = await fetch('http://localhost:8000/api/v1/groceries/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
           const errText = await response.text();
           throw new Error(`Backend sync failed: ${response.status} ${errText}`);
        }

        // Mark as synced locally
        for (const item of pendingItems) {
          await db.groceryList.update(item.id!, { sync_status: 'synced' });
        }
        
        console.log(`[Sync Engine] Successfully synced ${pendingItems.length} items.`);
      } catch (error) {
        console.error("[Sync Engine] Sync failed, will retry later.", error);
      }
    };

    window.addEventListener('online', syncData);
    
    // Attempt sync immediately on mount if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncData();
    }

    return () => window.removeEventListener('online', syncData);
  }, []);
}
