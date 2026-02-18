import { useState, useCallback } from "react";

export interface SavedSearch {
  id: string;
  label: string;
  gush: number;
  helka?: number;
  note?: string;
  createdAt: number;
}

const STORAGE_KEY = "saved-searches";

function loadSaved(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSaved(items: SavedSearch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useSavedSearches() {
  const [saved, setSaved] = useState<SavedSearch[]>(loadSaved);

  const addSaved = useCallback((entry: Omit<SavedSearch, "id" | "createdAt">) => {
    setSaved((prev) => {
      // Prevent exact duplicates
      const exists = prev.some(
        (s) => s.gush === entry.gush && s.helka === entry.helka,
      );
      if (exists) return prev;

      const newItem: SavedSearch = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      const updated = [newItem, ...prev];
      persistSaved(updated);
      return updated;
    });
  }, []);

  const removeSaved = useCallback((id: string) => {
    setSaved((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      persistSaved(updated);
      return updated;
    });
  }, []);

  const clearSaved = useCallback(() => {
    setSaved([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    setSaved((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, note } : s));
      persistSaved(updated);
      return updated;
    });
  }, []);

  return { saved, addSaved, removeSaved, clearSaved, updateNote };
}
