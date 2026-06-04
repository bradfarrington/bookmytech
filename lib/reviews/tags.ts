// Quick-tag chips offered on the customer review form, shared by the form, the
// review page, and the submit action's validation. Kept out of the
// "use server" actions file because such a file may only export async
// functions (Next.js).
export const REVIEW_TAGS = [
  "Punctual",
  "Friendly",
  "Great value",
  "Knowledgeable",
  "Tidy & clean",
  "Went the extra mile",
] as const;
