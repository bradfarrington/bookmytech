import "server-only";
import mjml2html from "mjml";

// Compile an MJML string to email-safe HTML. Used by every template in this
// folder so we don't have mjml2html scattered across actions.
//
// MJML compile errors throw — they're not user-recoverable, they're authoring
// bugs, so the caller doesn't need to handle them.
export async function renderEmail(mjml: string): Promise<string> {
  const { html, errors } = await mjml2html(mjml, { validationLevel: "soft" });
  if (errors.length > 0) {
    const summary = errors.map((e) => `${e.tagName}: ${e.message}`).join("; ");
    throw new Error(`MJML compile errors: ${summary}`);
  }
  return html;
}

// Minimal HTML-attribute / text escaping for values interpolated into MJML.
// MJML compiles to HTML, so any user-supplied string (mechanic name, etc.)
// must be escaped before insertion to avoid markup injection in the final email.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
