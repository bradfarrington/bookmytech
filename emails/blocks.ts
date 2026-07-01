// Copy-block email model (pure, client-safe). Every editable email is a data
// definition: a subject plus an ordered list of blocks. Admins edit the TEXT of
// the editable blocks (heading/paragraph/note/button label) and the subject; the
// structure, layout, branding and any dynamic tables (custom blocks) stay in
// code.
//
// This module has NO server imports so the admin editor UI can import the block
// types & interpolation. The MJML assembly + DB resolution live in ./resolve
// (server-only).

export type EmailBlockType = "heading" | "paragraph" | "note" | "button" | "custom";

export interface EmailBlockBase {
  /** Stable id — the override key. Unique within a template. */
  id: string;
  type: EmailBlockType;
}

export interface TextBlock extends EmailBlockBase {
  type: "heading" | "paragraph" | "note";
  /** Editable copy. Supports {{tokens}}, **bold**, and [label](https://…) links. */
  text: string;
}

export interface ButtonBlock extends EmailBlockBase {
  type: "button";
  /** Editable button label (supports {{tokens}}). */
  text: string;
  /** Name of the merge variable holding the button URL (not admin-editable). */
  hrefVar: string;
}

export interface CustomBlock extends EmailBlockBase {
  type: "custom";
  /** Key into the code-side renderer map (dynamic tables etc.). Not editable. */
  render: string;
}

export type EmailBlock = TextBlock | ButtonBlock | CustomBlock;

/** True when a block's text is admin-editable. */
export function isEditableBlock(b: EmailBlock): b is TextBlock | ButtonBlock {
  return b.type !== "custom";
}

export type MergeVars = Record<string, string | number | null | undefined>;

/** Replace {{token}} (optional inner spaces); unknown → "". */
export function interpolateTokens(text: string, vars: MergeVars): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
}
