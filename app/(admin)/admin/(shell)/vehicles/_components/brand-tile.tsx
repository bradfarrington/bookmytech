"use client";

import { useState } from "react";
import Link from "next/link";

// Brand tile for the /admin/vehicles grid. Logos come from the bundled pack in
// public/brands/ (HaynesPro's API has no make-level images): the owner's SVG
// pack first, a PNG fallback for the couple of makes it misses, and a
// styled-initials tile when neither file exists — each <img> error steps to
// the next candidate.

export function BrandTile({
  href,
  name,
  logoSlug,
}: {
  href: string;
  name: string;
  logoSlug: string;
}) {
  const candidates = [`/brands/${logoSlug}.svg`, `/brands/${logoSlug}.png`];
  const [candidate, setCandidate] = useState(0);

  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md"
    >
      <span className="flex h-16 w-full items-center justify-center">
        {candidate >= candidates.length ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-surface text-lg font-extrabold text-text-secondary">
            {initials(name)}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={candidates[candidate]}
            alt=""
            loading="lazy"
            className="max-h-16 max-w-full object-contain"
            onError={() => setCandidate((c) => c + 1)}
          />
        )}
      </span>
      <span className="text-center text-xs font-semibold leading-tight text-text-primary">
        {name}
      </span>
    </Link>
  );
}

function initials(name: string): string {
  const words = name.split(/[\s/&(]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
