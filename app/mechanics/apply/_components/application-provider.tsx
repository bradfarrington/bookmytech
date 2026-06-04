"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DocType } from "@/lib/onboarding/docs";

export interface UploadedDoc {
  path: string;
  fileName: string;
}

export interface ReferenceData {
  name: string;
  relationship: string;
  email: string;
  phone: string;
}

export interface ApplicationData {
  draftId: string;
  // Step 1
  fullName: string;
  email: string;
  phone: string;
  postcode: string;
  yearsExperience: string;
  // Step 2
  businessType: "" | "sole_trader" | "limited_company";
  businessName: string;
  businessNumber: string;
  vatRegistered: boolean;
  // Step 3
  specialisms: string[];
  serviceRadiusMiles: number;
  // Step 4
  docs: Partial<Record<DocType, UploadedDoc>>;
  references: [ReferenceData, ReferenceData];
}

const emptyRef = (): ReferenceData => ({ name: "", relationship: "", email: "", phone: "" });

function blank(draftId: string): ApplicationData {
  return {
    draftId,
    fullName: "",
    email: "",
    phone: "",
    postcode: "",
    yearsExperience: "",
    businessType: "",
    businessName: "",
    businessNumber: "",
    vatRegistered: false,
    specialisms: [],
    serviceRadiusMiles: 10,
    docs: {},
    references: [emptyRef(), emptyRef()],
  };
}

// Bank details are deliberately NOT part of the persisted ApplicationData —
// they live in their own state here and are never written to sessionStorage.
interface BankData {
  sortCode: string;
  accountNumber: string;
}

interface ApplicationContextValue {
  data: ApplicationData;
  update: (patch: Partial<ApplicationData>) => void;
  bank: BankData;
  setBank: (patch: Partial<BankData>) => void;
  reset: () => void;
}

const ApplicationContext = createContext<ApplicationContextValue | null>(null);

const STORAGE_KEY = "bmt:mechanic-application";

export function ApplicationProvider({ children }: { children: React.ReactNode }) {
  // Lazily restore from sessionStorage (survives refresh / step navigation).
  const [data, setData] = useState<ApplicationData>(() => blank(""));
  const [bank, setBankState] = useState<BankData>({ sortCode: "", accountNumber: "" });
  const hydrated = useRef(false);

  useEffect(() => {
    // Runs once on mount in the browser — generate or restore the draft id.
    let restored: ApplicationData | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw) as ApplicationData;
    } catch {
      restored = null;
    }
    if (restored?.draftId) {
      setData(restored);
    } else {
      setData(blank(crypto.randomUUID()));
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current || !data.draftId) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* sessionStorage full / unavailable — non-fatal */
    }
  }, [data]);

  const update = useCallback((patch: Partial<ApplicationData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const setBank = useCallback((patch: Partial<BankData>) => {
    setBankState((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setData(blank(crypto.randomUUID()));
    setBankState({ sortCode: "", accountNumber: "" });
  }, []);

  return (
    <ApplicationContext.Provider value={{ data, update, bank, setBank, reset }}>
      {children}
    </ApplicationContext.Provider>
  );
}

export function useApplication(): ApplicationContextValue {
  const ctx = useContext(ApplicationContext);
  if (!ctx) throw new Error("useApplication must be used within ApplicationProvider");
  return ctx;
}
