import { describe, expect, it } from "vitest";
import { interpolateTokens, isEditableBlock, type MergeVars } from "./blocks";
import { EMAIL_TEMPLATE_DEFS } from "./registry";

// The two email-change templates (Task 58). They matter more than most: they
// replaced Supabase's own "Confirm Email Change" mail, and a token left
// uninterpolated in the confirmation link is a customer who cannot move their
// address at all.
//
// Only the pure modules are exercised here. `emails/resolve.ts` imports
// "server-only" and reads admin overrides from the database, so the full send
// path is checked live instead — see docs/tasks/58-first-party-email-change.md.

const KEYS = ["email_change_confirm", "email_change_notice"] as const;

/** What lib/account/email-change.ts actually passes each template. */
const SENT: Record<(typeof KEYS)[number], MergeVars> = {
  email_change_confirm: {
    name: "Alex",
    new_email: "alex@newmail.com",
    current_email: "alex@oldmail.com",
    action_link: "https://bookmytech.co.uk/account/confirm-email?token=abc",
  },
  email_change_notice: {
    name: "Alex",
    new_email: "alex@newmail.com",
    current_email: "alex@oldmail.com",
    support_email: "support@bookmytech.co.uk",
  },
};

describe.each(KEYS)("%s", (key) => {
  const def = EMAIL_TEMPLATE_DEFS.find((d) => d.key === key);

  it("is in the registry with a subject and a preheader", () => {
    expect(def).toBeDefined();
    expect(def!.subject.length).toBeGreaterThan(0);
    expect(def!.preheader?.length).toBeGreaterThan(0);
    expect(def!.category).toBe("customer");
  });

  it("declares every variable its copy uses, and uses every one it declares", () => {
    const declared = new Set(def!.variables.map((v) => v.name));

    const used = new Set<string>();
    for (const block of def!.blocks) {
      if (!isEditableBlock(block)) continue;
      for (const m of (block.text ?? "").matchAll(/\{\{([a-z_]+)\}\}/g)) used.add(m[1]);
      if ("hrefVar" in block && block.hrefVar) used.add(block.hrefVar);
    }
    for (const name of used) expect(declared).toContain(name);

    // The other direction catches a variable left behind by an edit, which the
    // admin template editor would then offer for copy that no longer exists.
    for (const name of declared) expect(used).toContain(name);
  });

  it("leaves nothing uninterpolated once the real merge vars are applied", () => {
    const vars = SENT[key];
    for (const block of def!.blocks) {
      if (!isEditableBlock(block)) continue;
      expect(interpolateTokens(block.text ?? "", vars)).not.toMatch(/\{\{/);
    }
    expect(interpolateTokens(def!.subject, vars)).not.toMatch(/\{\{/);
    expect(interpolateTokens(def!.preheader ?? "", vars)).not.toMatch(/\{\{/);
  });

  it("has stable, unique block ids, which key the admin overrides", () => {
    const ids = def!.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the two templates differ in the way that matters", () => {
  const confirm = EMAIL_TEMPLATE_DEFS.find((d) => d.key === "email_change_confirm")!;
  const notice = EMAIL_TEMPLATE_DEFS.find((d) => d.key === "email_change_notice")!;

  it("only the confirmation carries a link", () => {
    const buttons = (def: typeof confirm) => def.blocks.filter((b) => b.type === "button");
    expect(buttons(confirm)).toHaveLength(1);
    // The notice goes to the address being moved AWAY from. A link there would
    // invite the wrong inbox to complete the change, which is the one thing
    // this email must not do — it exists so a change can't happen quietly.
    expect(buttons(notice)).toHaveLength(0);
  });

  it("the confirmation link comes from a variable, never a hardcoded href", () => {
    const button = confirm.blocks.find((b) => b.type === "button");
    expect(button && "hrefVar" in button && button.hrefVar).toBe("action_link");
  });

  it("the notice tells people what to do if it wasn't them", () => {
    const copy = notice.blocks
      .map((b) => (isEditableBlock(b) ? b.text ?? "" : ""))
      .join(" ")
      .toLowerCase();
    expect(copy).toContain("wasn't you");
    expect(copy).toContain("{{support_email}}");
  });
});
