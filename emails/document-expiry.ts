import "server-only";
import { renderTemplateEmail, type RenderedEmail } from "./resolve";

export type { RenderedEmail };

export interface DocumentExpiryInput {
  name: string;
  docLabel: string;
  /** Days until expiry; 0 = expires today, negative = already expired. */
  daysRemaining: number;
  /** Absolute URL to the mechanic documents page. */
  documentsLink: string;
}

export async function renderDocumentExpiryEmail({
  docLabel,
  daysRemaining,
  documentsLink,
}: DocumentExpiryInput): Promise<RenderedEmail> {
  const key = daysRemaining <= 0 ? "document_expired" : "document_expiring";
  return renderTemplateEmail(key, { doc: docLabel, documents_link: documentsLink });
}
