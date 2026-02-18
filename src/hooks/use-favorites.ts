/**
 * use-favorites.ts – Hook for managing user's favorite parcels
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Favorite {
  id: string;
  gush: number;
  helka: number;
  label: string | null;
  created_at: string;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
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

  const fetchFavorites = useCallback(async () => {
    if (!userId) { setFavorites([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("favorites")
        .select("*")
        .order("created_at", { ascending: false });
      setFavorites((data as Favorite[]) ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);

  const addFavorite = useCallback(async (gush: number, helka: number, label?: string) => {
    if (!userId) return;
    await supabase.from("favorites").insert({
      user_id: userId,
      gush,
      helka,
      label: label ?? `גוש ${gush}, חלקה ${helka}`,
    });
    fetchFavorites();
  }, [userId, fetchFavorites]);

  const removeFavorite = useCallback(async (id: string) => {
    await supabase.from("favorites").delete().eq("id", id);
    fetchFavorites();
  }, [fetchFavorites]);

  const isFavorite = useCallback((gush: number, helka: number) => {
    return favorites.some(f => f.gush === gush && f.helka === helka);
  }, [favorites]);

  return { favorites, loading, addFavorite, removeFavorite, isFavorite, isLoggedIn: !!userId };
}
