"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApplication } from "./application-provider";

// Captures the originating recruitment area from ?area=<slug> (set by the
// public /mechanics/<area> pages) into the application draft, so the submitted
// application can be tagged to the area for recruitment tracking. Persists via
// the provider's sessionStorage, so it survives the multi-step flow even though
// later steps drop the query param.
export function AreaCapture() {
  const params = useSearchParams();
  const { data, update } = useApplication();

  useEffect(() => {
    const area = params.get("area");
    if (area && area !== data.sourceAreaSlug) {
      update({ sourceAreaSlug: area });
    }
  }, [params, data.sourceAreaSlug, update]);

  return null;
}
