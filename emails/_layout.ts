import "server-only";

// Shared MJML chrome for every Book My Tech email: branded header, content
// slot, footer. Templates call this to keep the look consistent so we never
// hand-roll a `<mjml>` wrapper inline.
//
// `content` is raw MJML — typically one or more <mj-section> blocks. Any
// dynamic values inside must be escaped by the caller (see escapeHtml in
// ./render.ts).

export interface LayoutInput {
  /** Preheader text shown next to the subject line in inbox lists. */
  preheader?: string;
  /** Raw MJML to drop between the branded header and the footer. */
  content: string;
}

const BRAND_BLUE = "#2563EB";
const TEXT_PRIMARY = "#0F172A";
const TEXT_MUTED = "#64748B";
const SURFACE = "#F8FAFC";
const SURFACE_CARD = "#FFFFFF";
const BORDER = "#E2E8F0";

// Email clients can't load relative/localhost assets, so the logo is served
// from a public Supabase Storage bucket (same project, reachable everywhere).
const LOGO_URL = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/email-assets/logo-no-bg.png`;

export function layout({ preheader, content }: LayoutInput): string {
  return `
<mjml>
  <mj-head>
    <mj-title>Book My Tech</mj-title>
    ${preheader ? `<mj-preview>${preheader}</mj-preview>` : ""}
    <mj-attributes>
      <mj-all font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" />
      <mj-text font-size="14px" line-height="1.65" color="${TEXT_PRIMARY}" />
      <mj-button background-color="${BRAND_BLUE}" color="#FFFFFF" font-weight="600" border-radius="8px" inner-padding="14px 28px" />
      <mj-section background-color="${SURFACE_CARD}" padding="0" />
    </mj-attributes>
    <mj-style>
      a { color: ${BRAND_BLUE}; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${SURFACE}">
    <!-- Header -->
    <mj-section background-color="${SURFACE_CARD}" padding="28px 24px 16px">
      <mj-column>
        <mj-image src="${LOGO_URL}" alt="Book My Tech" width="200px" align="left" padding="0" />
      </mj-column>
    </mj-section>

    <!-- Content -->
    ${content}

    <!-- Footer -->
    <mj-section background-color="${SURFACE_CARD}" padding="32px 24px 28px" border-top="1px solid ${BORDER}">
      <mj-column>
        <mj-text align="center" color="${TEXT_MUTED}" font-size="12px" line-height="1.6">
          Book My Tech &middot; UK mobile mechanic platform<br />
          Questions? <a href="mailto:help@bookmytech.co.uk">help@bookmytech.co.uk</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`.trim();
}
