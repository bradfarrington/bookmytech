// Single source of truth for the wizard steps — used by the progress header
// and step-to-step navigation.

export interface ApplyStep {
  path: string;
  shortLabel: string;
  title: string;
}

export const APPLY_STEPS: readonly ApplyStep[] = [
  { path: "/mechanics/apply/step-1", shortLabel: "About", title: "About you" },
  { path: "/mechanics/apply/step-2", shortLabel: "Business", title: "Your business" },
  { path: "/mechanics/apply/step-3", shortLabel: "Specialisms", title: "Specialisms & service area" },
  { path: "/mechanics/apply/step-4", shortLabel: "Documents", title: "Documents & references" },
  { path: "/mechanics/apply/review", shortLabel: "Review", title: "Review & submit" },
] as const;

export function stepIndex(pathname: string): number {
  const i = APPLY_STEPS.findIndex((s) => pathname.startsWith(s.path));
  return i === -1 ? 0 : i;
}
