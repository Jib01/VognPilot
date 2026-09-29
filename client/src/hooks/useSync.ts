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
        
        // Mock Backend Sync Call
        // const response = await fetch('http://localhost:8000/api/v1/list/sync', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(pendingItems)
        // });
        
        // if (!response.ok) throw new Error("Backend sync failed");

        // Simulate network delay for the mock
        await new Promise(resolve => setTimeout(resolve, 800));

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
