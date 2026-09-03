import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotificationEnabled } from "@/lib/notifications/toggles";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import { CUSTOM_RENDERERS } from "./custom-renderers";
import { interpolateTokens, type EmailBlock, type MergeVars } from "./blocks";
import { EMAIL_TEMPLATE_BY_KEY, type EmailTemplateDef } from "./registry";

export interface RenderedEmail {
  subject: string;
  html: string;
}

// Turn admin plain-text copy into safe MJML inline HTML: escape, then re-enable
// a tiny markdown subset — **bold** and [label](url) links.
function inlineHtml(text: string, vars: MergeVars): string {
  let out = escapeHtml(interpolateTokens(text, vars));
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, label: string, href: string) => `<a href="${href}">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

function blockToMjml(block: EmailBlock, text: string, vars: MergeVars): string {
  switch (block.type) {
    case "heading":
      return `<mj-text font-size="24px" font-weight="800" line-height="1.3" color="#0F172A">${inlineHtml(text, vars)}</mj-text>`;
    case "paragraph":
      return `<mj-text padding-top="8px">${inlineHtml(text, vars)}</mj-text>`;
    case "note":
      return `<mj-text color="#64748B" font-size="12px" padding-top="16px">${inlineHtml(text, vars)}</mj-text>`;
    case "button": {
      const href = vars[block.hrefVar];
      const safeHref = href == null ? "#" : escapeHtml(String(href));
      return `<mj-button href="${safeHref}" align="left" padding="20px 0 8px">${inlineHtml(text, vars)}</mj-button>`;
    }
    case "custom": {
      const fn = CUSTOM_RENDERERS[block.render];
      return fn ? fn(vars) : "";
    }
  }
}

// Shared render: def + resolved copy (subject template + per-block text overrides)
// + merge vars → { subject, html }.
async function renderFromCopy(
  def: EmailTemplateDef,
  subjectTemplate: string,
  blockOverrides: Record<string, string>,
  vars: MergeVars,
): Promise<RenderedEmail> {
  const content = def.blocks
    .map((b) => blockToMjml(b, b.type === "custom" ? "" : blockOverrides[b.id] ?? b.text, vars))
    .filter(Boolean)
    .join("\n        ");

  const mjml = layout({
    preheader: def.preheader ? interpolateTokens(def.preheader, vars) : undefined,
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          ${content}
        </mj-column>
      </mj-section>`,
  });

  return { subject: interpolateTokens(subjectTemplate, vars), html: await renderEmail(mjml) };
}

/** Fetch the admin override row for a key (best-effort). */
async function fetchOverride(
  key: string,
): Promise<{ subject: string | null; blocks: Record<string, string> } | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("email_templates")
      .select("subject, blocks")
      .eq("key", key)
      .maybeSingle();
    if (!data) return null;
    return {
      subject: (data.subject as string | null) ?? null,
      blocks: (data.blocks as Record<string, string>) ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * The value `renderTemplateEmail` returns for a template an admin has switched
 * OFF (Task 22). `sendEmail` refuses to send an empty `html`, so the ~40 call
 * sites that do `.then(({ subject, html }) => sendEmail({ to, subject, html }))`
 * need no change and no throw: the email simply doesn't go. Anything that
 * inspects the result can test `isSkippedEmail`.
 */
export const SKIPPED_EMAIL: RenderedEmail = Object.freeze({ subject: "", html: "" });

export function isSkippedEmail(email: RenderedEmail): boolean {
  return email.html === "";
}

/**
 * Render a live email: overrides over code defaults, merge vars interpolated,
 * MJML compiled. Throws only on genuine MJML compile bugs — a missing override
 * or table just uses defaults. A template switched off by an admin returns
 * `SKIPPED_EMAIL` instead of rendering.
 */
export async function renderTemplateEmail(
  key: string,
  vars: MergeVars = {},
): Promise<RenderedEmail> {
  const def = EMAIL_TEMPLATE_BY_KEY[key];
  if (!def) throw new Error(`Unknown email template: ${key}`);
  if (!(await isNotificationEnabled("email", key))) return SKIPPED_EMAIL;
  const override = await fetchOverride(key);
  return renderFromCopy(def, override?.subject || def.subject, override?.blocks ?? {}, vars);
}

/**
 * Render a preview from an admin's UNSAVED draft copy, using each variable's
 * example value. Used by the editor's live preview.
 */
export async function previewTemplateEmail(
  key: string,
  draftSubject: string,
  draftBlocks: Record<string, string>,
): Promise<RenderedEmail> {
  const def = EMAIL_TEMPLATE_BY_KEY[key];
  if (!def) throw new Error(`Unknown email template: ${key}`);
  const vars: MergeVars = Object.fromEntries(def.variables.map((v) => [v.name, v.example]));
  return renderFromCopy(def, draftSubject || def.subject, draftBlocks, vars);
}
