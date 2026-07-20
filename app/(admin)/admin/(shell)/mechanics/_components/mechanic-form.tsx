"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createMechanicAction } from "@/app/actions/mechanics";

export interface ServiceOption {
  slug: string;
  name: string;
}

interface MechanicFormProps {
  services: ServiceOption[];
}

const FIELD_LABEL =
  "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

export function MechanicForm({ services }: MechanicFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [basePostcode, setBasePostcode] = useState("");
  const [radius, setRadius] = useState("10");
  const [bio, setBio] = useState("");
  const [selectedSpecialisms, setSelectedSpecialisms] = useState<Set<string>>(new Set());

  function toggleSpecialism(slug: string) {
    setSelectedSpecialisms((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const fd = new FormData();
        fd.set("email", email);
        fd.set("full_name", fullName);
        fd.set("phone", phone);
        fd.set("base_postcode", basePostcode);
        fd.set("service_radius_miles", radius);
        fd.set("bio", bio);
        for (const slug of selectedSpecialisms) fd.append("specialisms", slug);

        startTransition(async () => {
          const result = await createMechanicAction(fd);
          if (result?.error) {
            setError(result.error);
            toast.error(result.error);
          }
        });
      }}
      className="space-y-6"
    >
      <Card className="space-y-5 p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={pending}
              placeholder="e.g. Mike Wilson"
              className={FIELD_INPUT}
            />
          </label>

          <label className={FIELD_LABEL}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={pending}
              placeholder="mike@example.com"
              autoComplete="off"
              className={FIELD_INPUT}
            />
            <span className="text-xs font-normal text-text-muted">
              They&apos;ll receive a magic-link invite at this address.
            </span>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>
              Phone <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={pending}
              placeholder="07700 900000"
              autoComplete="off"
              className={FIELD_INPUT}
            />
          </label>

          <label className={FIELD_LABEL}>
            <span>
              Base postcode <span className="font-normal text-text-muted">(optional)</span>
            </span>
            <input
              type="text"
              value={basePostcode}
              onChange={(e) => setBasePostcode(e.target.value.toUpperCase())}
              disabled={pending}
              placeholder="SE15"
              autoCapitalize="characters"
              maxLength={8}
              className={`${FIELD_INPUT} font-bold uppercase tracking-[0.04em] placeholder:font-medium placeholder:normal-case placeholder:tracking-normal`}
            />
            <span className="text-xs font-normal text-text-muted">
              Drives dispatch matching. Full postcode or outward code (e.g. &quot;SE15&quot;).
            </span>
          </label>
        </div>

        <label className={FIELD_LABEL}>
          <span>Service radius (miles)</span>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            disabled={pending}
            className={`${FIELD_INPUT} max-w-[200px]`}
          />
        </label>

        <div className={FIELD_LABEL}>
          <span>Specialisms</span>
          <span className="text-xs font-normal text-text-muted">
            The work this mechanic is strongest at — profile and vetting
            context only. Jobs are offered to every mechanic in range.
          </span>
          {services.length === 0 ? (
            <p className="text-sm text-text-muted">No specialisms defined.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
              {services.map((service) => (
                <label
                  key={service.slug}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm font-medium text-text-primary hover:border-brand-blue/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedSpecialisms.has(service.slug)}
                    onChange={() => toggleSpecialism(service.slug)}
                    disabled={pending}
                    className="size-4 rounded border-border accent-brand-blue"
                  />
                  <span>{service.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className={FIELD_LABEL}>
          <span>
            Bio <span className="font-normal text-text-muted">(optional)</span>
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={pending}
            rows={3}
            placeholder="Shown to customers after a job is assigned."
            className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href="/admin/mechanics">
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </Link>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Creating…" : "Create mechanic & send invite"}
        </Button>
      </div>
    </form>
  );
}
