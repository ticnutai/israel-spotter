/**
 * use-watch-parcels.ts – Hook for managing parcel watch/notification subscriptions
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WatchParcel {
  id: string;
  gush: number;
  helka: number;
  notify_email: boolean;
  created_at: string;
}

export function useWatchParcels() {
  const [watches, setWatches] = useState<WatchParcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchWatches = useCallback(async () => {
    if (!userId) { setWatches([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("watch_parcels")
        .select("*")
        .order("created_at", { ascending: false });
      setWatches((data as WatchParcel[]) ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchWatches(); }, [fetchWatches]);

  const addWatch = useCallback(async (gush: number, helka: number) => {
    if (!userId) return;
    await supabase.from("watch_parcels").insert({
      user_id: userId,
      gush,
      helka,
      notify_email: true,
    });
    fetchWatches();
  }, [userId, fetchWatches]);

  const removeWatch = useCallback(async (id: string) => {
    await supabase.from("watch_parcels").delete().eq("id", id);
    fetchWatches();
  }, [fetchWatches]);

  const isWatching = useCallback((gush: number, helka: number) => {
    return watches.some(w => w.gush === gush && w.helka === helka);
  }, [watches]);

  return { watches, loading, addWatch, removeWatch, isWatching, isLoggedIn: !!userId };
}
