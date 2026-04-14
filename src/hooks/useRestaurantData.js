import { useState, useEffect, useCallback } from 'react';

// Module-level cache — survives navigation (component unmount/remount)
const cache = {};

export function useRestaurantData(slug) {
  const [data, setData] = useState(cache[slug]?.data || null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(cache[slug]?.lastUpdated || null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${slug}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const live = await res.json();
      const ts = live.meta?.lastUpdated || new Date().toISOString();
      cache[slug] = { data: live, lastUpdated: ts };
      setData(live);
      setLastUpdated(ts);
    } catch (err) {
      console.error('Live fetch failed, falling back to static', err);
      // Fall back to static JSON if API fails
      if (!cache[slug]) {
        try {
          const files = ['summary', 'facebook', 'google-ads', 'google-private', 'reservations', 'perfect-venue', 'email'];
          const results = await Promise.all(
            files.map(f => fetch(`/data/${slug}/${f}.json`).then(r => r.ok ? r.json() : null).catch(() => null))
          );
          const [summary, facebook, googleAds, googlePrivate, reservations, perfectVenue, email] = results;
          const staticData = { summary, facebook, googleAds, googlePrivate, reservations, perfectVenue, email };
          setData(staticData);
          setLastUpdated(summary?.meta?.lastUpdated || null);
        } catch (e) {
          console.error('Static fallback also failed', e);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // Already have fresh cached data — no need to re-fetch
    if (cache[slug]) {
      setLoading(false);
      return;
    }
    refresh();
  }, [slug, refresh]);

  return { data, loading, lastUpdated, refresh };
}
