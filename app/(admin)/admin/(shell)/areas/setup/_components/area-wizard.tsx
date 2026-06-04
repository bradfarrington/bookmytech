"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, slugify, formatPrice } from "@/lib/utils";
import { createAreaAndRedirect } from "@/app/actions/areas";

// 5-step "launch a city" wizard. Collects everything for one CreateAreaInput,
// then on the final step the admin either saves it as 'planned' or creates +
// activates it. Step state is local (a create form, not shareable URL state).

const STEPS = [
  "Area definition",
  "Pricing",
  "Mechanic recruitment",
  "Demand seeding",
  "Launch checklist",
] as const;

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "bank_holidays", label: "Bank-holiday operating calendar reviewed" },
  { key: "operating_hours", label: "Regional operating hours confirmed" },
  { key: "partnerships", label: "Local partnerships / supplier coverage lined up" },
  { key: "first_mechanics", label: "First mechanics identified or recruiting" },
];

const FIELD_LABEL = "flex flex-col gap-1.5 text-sm font-semibold text-text-primary";
const FIELD_INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm font-normal text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

export function AreaWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [prefixesText, setPrefixesText] = useState("");
  const [multiplier, setMultiplier] = useState("1.000");
  const [targetMechanics, setTargetMechanics] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [headline, setHeadline] = useState("");
  const [blurb, setBlurb] = useState("");
  const [budget, setBudget] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const slug = slugify(name);
  const prefixes = prefixesText
    .split(/[\s,]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  function next() {
    if (step === 0 && !name.trim()) {
      toast.error("Give the area a name.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit(activate: boolean) {
    if (!name.trim()) {
      toast.error("Give the area a name.");
      setStep(0);
      return;
    }
    const input = {
      name: name.trim(),
      postcodePrefixes: prefixes,
      labourMultiplier: Number(multiplier) || 1,
      status: (activate ? "active" : "planned") as "active" | "planned",
      targetMechanicCount: targetMechanics ? Number(targetMechanics) : null,
      referralCode: (referralCode || (slug ? `${slug}-launch` : "")) || null,
      recruitmentHeadline: headline || null,
      recruitmentBlurb: blurb || null,
      acquisitionBudgetPence: budget ? Math.round(Number(budget) * 100) : null,
      launchChecklist: checklist,
    };
    startTransition(async () => {
      const res = await createAreaAndRedirect(input);
      // createAreaAndRedirect redirects on success; only errors return here.
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full",
                i < step
                  ? "bg-brand-blue text-white"
                  : i === step
                    ? "bg-brand-blue/15 text-brand-blue ring-2 ring-brand-blue"
                    : "bg-surface text-text-muted",
              )}
            >
              {i < step ? <Check size={13} /> : i + 1}
            </span>
            <span className={i === step ? "text-text-primary" : "text-text-muted"}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 text-border">→</span>}
          </li>
        ))}
      </ol>

      <Card className="space-y-5 p-6">
        {step === 0 && (
          <>
            <label className={FIELD_LABEL}>
              <span>Area name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Leeds"
                className={FIELD_INPUT}
              />
              {slug && <span className="text-xs font-normal text-text-muted">Recruitment URL: /mechanics/{slug}</span>}
            </label>
            <label className={FIELD_LABEL}>
              <span>Postcode prefixes</span>
              <textarea
                value={prefixesText}
                onChange={(e) => setPrefixesText(e.target.value)}
                rows={3}
                placeholder="Paste or type, comma- or space-separated: LS1, LS2, LS6, WF…"
                className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
              />
              <span className="text-xs font-normal text-text-muted">
                {prefixes.length} prefix{prefixes.length === 1 ? "" : "es"}. Longest-prefix-wins
                when a postcode matches more than one area.
              </span>
            </label>
          </>
        )}

        {step === 1 && (
          <label className={FIELD_LABEL}>
            <span>Labour multiplier</span>
            <input
              type="number"
              step="0.005"
              min="0.5"
              max="3"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className={`${FIELD_INPUT} max-w-40`}
            />
            <span className="text-xs font-normal text-text-muted">
              1.000 = national base. 1.150 = +15% on labour for this area. Per-service
              overrides live on the Pricing page once the area is live.
            </span>
          </label>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={FIELD_LABEL}>
                <span>Target mechanic count</span>
                <input
                  type="number"
                  min="0"
                  value={targetMechanics}
                  onChange={(e) => setTargetMechanics(e.target.value)}
                  placeholder="e.g. 15"
                  className={FIELD_INPUT}
                />
              </label>
              <label className={FIELD_LABEL}>
                <span>Referral code</span>
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder={slug ? `${slug}-launch` : "leeds-launch"}
                  className={`${FIELD_INPUT} font-mono`}
                />
                <span className="text-xs font-normal text-text-muted">
                  Used on the area recruitment link. Defaults to{" "}
                  <code>{slug ? `${slug}-launch` : "<area>-launch"}</code>.
                </span>
              </label>
            </div>
            <label className={FIELD_LABEL}>
              <span>Recruitment headline</span>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={name ? `Become a Book My Tech mechanic in ${name}` : "Headline for the recruitment page"}
                className={FIELD_INPUT}
              />
            </label>
            <label className={FIELD_LABEL}>
              <span>Recruitment blurb</span>
              <textarea
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                rows={3}
                placeholder="Short pitch shown on the public /mechanics/<area> page."
                className={`${FIELD_INPUT} h-auto resize-y py-2.5`}
              />
            </label>
          </>
        )}

        {step === 3 && (
          <label className={FIELD_LABEL}>
            <span>Acquisition budget (optional)</span>
            <div className="relative max-w-48">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-text-muted">£</span>
              <input
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="2000.00"
                className={`${FIELD_INPUT} pl-8`}
              />
            </div>
            <span className="text-xs font-normal text-text-muted">
              Planned paid-acquisition spend for the launch. Informational — drives
              the launch plan, not billing.
            </span>
          </label>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-text-primary">Launch checklist</p>
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-3 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={!!checklist[item.key]}
                  onChange={(e) => setChecklist((c) => ({ ...c, [item.key]: e.target.checked }))}
                  className="size-4 rounded border-border accent-brand-blue"
                />
                {item.label}
              </label>
            ))}
            <div className="mt-4 rounded-button border border-border bg-surface p-4 text-sm">
              <p className="font-semibold text-text-primary">Ready to launch {name || "this area"}</p>
              <ul className="mt-2 space-y-1 text-xs text-text-muted">
                <li>{prefixes.length} postcode prefixes · ×{Number(multiplier).toFixed(3)} labour</li>
                <li>
                  Target {targetMechanics || "—"} mechanics
                  {budget ? ` · ${formatPrice(Math.round(Number(budget) * 100))} acquisition` : ""}
                </li>
                <li>Save as planned to recruit first, or activate to start pricing bookings now.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between border-t border-border pt-5">
          <Button type="button" variant="ghost" iconLeft={ArrowLeft} disabled={step === 0 || pending} onClick={back}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" variant="primary" iconRight={ArrowRight} onClick={next} disabled={pending}>
              Continue
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => submit(false)}>
                Save as planned
              </Button>
              <Button type="button" variant="primary" iconLeft={Rocket} disabled={pending} onClick={() => submit(true)}>
                {pending ? "Launching…" : "Create & activate"}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <button
        type="button"
        onClick={() => router.push("/admin/areas")}
        className="text-sm font-medium text-text-muted hover:text-text-primary"
      >
        Cancel and go back to areas
      </button>
    </div>
  );
}
