import { useState, useEffect, useCallback, useRef } from 'react';

// Module-level cache — survives navigation (component unmount/remount)
const cache = {};

async function loadSnapshot(slug) {
  const res = await fetch(`/data/${slug}/snapshot.json`);
  if (!res.ok) throw new Error('no snapshot');
  return res.json();
}

export function useRestaurantData(slug) {
  const [data, setData] = useState(cache[slug]?.data || null);
  const [loading, setLoading] = useState(!cache[slug]);
  const [lastUpdated, setLastUpdated] = useState(cache[slug]?.lastUpdated || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/${slug}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const live = await res.json();
      const ts = live.meta?.lastUpdated || new Date().toISOString();
      cache[slug] = { data: live, lastUpdated: ts };
      if (mounted.current) { setData(live); setLastUpdated(ts); }
    } catch (err) {
      console.error('Live fetch failed', err);
    } finally {
      if (mounted.current) setIsRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (cache[slug]) {
      setLoading(false);
      return;
    }

    // Show snapshot instantly, then refresh live in background
    loadSnapshot(slug)
      .then(snap => { if (mounted.current) { setData(snap); setLastUpdated(snap?.meta?.lastUpdated || null); } })
      .catch(() => {})
      .finally(() => { if (mounted.current) setLoading(false); });

    refresh();
  }, [slug, refresh]);

  return { data, loading, lastUpdated, refresh, isRefreshing };
}
