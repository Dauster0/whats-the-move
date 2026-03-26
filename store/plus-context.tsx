import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  loadEntitlements,
  type EntitlementsRecord,
  isPlusEffective,
} from "../lib/plus-entitlements";

type PlusContextValue = {
  entitlements: EntitlementsRecord | null;
  loaded: boolean;
  isPlus: boolean;
  refresh: () => Promise<void>;
};

const PlusContext = createContext<PlusContextValue | undefined>(undefined);

export function PlusProvider({ children }: { children: React.ReactNode }) {
  const [entitlements, setEntitlements] = useState<EntitlementsRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const e = await loadEntitlements();
    setEntitlements(e);
  }, []);

  useEffect(() => {
    void (async () => {
      const e = await loadEntitlements();
      setEntitlements(e);
      setLoaded(true);
    })();
  }, []);

  const isPlus = useMemo(
    () => (entitlements ? isPlusEffective(entitlements) : false),
    [entitlements]
  );

  const value = useMemo(
    () => ({ entitlements, loaded, isPlus, refresh }),
    [entitlements, loaded, isPlus, refresh]
  );

  return <PlusContext.Provider value={value}>{children}</PlusContext.Provider>;
}

export function usePlusEntitlements() {
  const ctx = useContext(PlusContext);
  if (!ctx) {
    throw new Error("usePlusEntitlements must be used within PlusProvider");
  }
  return ctx;
}

/** Safe when provider might not wrap (e.g. tests) — defaults to not Plus until loaded. */
export function usePlusOptional() {
  const ctx = useContext(PlusContext);
  return (
    ctx ?? {
      entitlements: null,
      loaded: false,
      isPlus: false,
      refresh: async () => {},
    }
  );
}
