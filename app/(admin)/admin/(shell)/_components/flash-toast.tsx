"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Mapping of supported ?flash= values to the toast they fire on arrival.
// Server actions redirect with one of these keys after a successful mutation;
// this listener picks it up post-navigation, fires the toast, and strips the
// param from the URL so a refresh doesn't re-toast.
const FLASH_MESSAGES: Record<string, string> = {
  "service-created": "Service created.",
  "service-updated": "Service updated.",
  "category-created": "Category created.",
  "category-updated": "Category updated.",
  "category-deleted": "Category deleted.",
};

export function FlashToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lastShownRef = useRef<string | null>(null);

  useEffect(() => {
    const flash = params.get("flash");
    if (!flash) return;

    // Guard against double-fires from React StrictMode in dev
    const key = `${pathname}:${flash}`;
    if (lastShownRef.current === key) return;

    const message = FLASH_MESSAGES[flash];
    if (message) {
      toast.success(message);
      lastShownRef.current = key;
    }

    // Strip the flash param so a refresh doesn't replay the toast
    const next = new URLSearchParams(params.toString());
    next.delete("flash");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [params, router, pathname]);

  return null;
}
