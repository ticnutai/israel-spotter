import { useState, useCallback } from "react";

export interface SearchHistoryItem {
  id: string;
  type: "gush" | "address";
  label: string;
  gush?: number;
  helka?: number;
  address?: string;
  timestamp: number;
}

const STORAGE_KEY = "search-history";
const MAX_ITEMS = 10;

function loadHistory(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: SearchHistoryItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>(loadHistory);

  const addEntry = useCallback((entry: Omit<SearchHistoryItem, "id" | "timestamp">) => {
    setHistory((prev) => {
      const newItem: SearchHistoryItem = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      // Remove duplicate
      const filtered = prev.filter(
        (h) =>
          !(h.type === entry.type &&
            h.gush === entry.gush &&
            h.helka === entry.helka &&
            h.address === entry.address)
      );
      const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addEntry, clearHistory };
}
