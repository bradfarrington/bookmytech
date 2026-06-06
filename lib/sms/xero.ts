import "server-only";

// Xero invoicing for SMS credit top-ups (Task 13 Stage B). The agency invoices
// the Book My Tech owner for each top-up via a Xero custom connection
// (client-credentials grant). Entirely env-gated: if XERO_CLIENT_ID /
// XERO_CLIENT_SECRET are unset, raiseTopUpInvoice() is a no-op. All callers
// treat failures as non-fatal — credits are granted regardless of Xero.
//
// Required config (env, not hardcoded):
//   XERO_CLIENT_ID, XERO_CLIENT_SECRET   custom-connection credentials
//   XERO_CONTACT_NAME, XERO_CONTACT_EMAIL the BMT owner as the Xero contact
//   XERO_SALES_ACCOUNT_CODE              revenue account (e.g. "200")

function basicAuth(id: string, secret: string): string {
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function getAccessToken(id: string, secret: string): Promise<string> {
  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(id, secret),
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "accounting.invoices accounting.contacts accounting.payments",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Xero token error: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function getTenantId(token: string): Promise<string> {
  const res = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data) || data.length === 0)
    throw new Error(`Xero connections error: ${JSON.stringify(data)}`);
  return data[0].tenantId as string;
}

async function getBankAccountId(token: string, tenantId: string): Promise<string> {
  const res = await fetch(
    'https://api.xero.com/api.xro/2.0/Accounts?where=Type%3D%3D%22BANK%22%26%26Status%3D%3D%22ACTIVE%22',
    { headers: { Authorization: `Bearer ${token}`, "Xero-Tenant-Id": tenantId, Accept: "application/json" } },
  );
  const data = await res.json();
  const accounts = data?.Accounts;
  if (!res.ok || !Array.isArray(accounts) || accounts.length === 0)
    throw new Error(`Xero bank account fetch error: ${JSON.stringify(data)}`);
  return accounts[0].AccountID as string;
}

async function createInvoice(
  token: string,
  tenantId: string,
  amountGBP: number,
  credits: number,
  paymentId: string,
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-Tenant-Id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Invoices: [
        {
          Type: "ACCREC",
          Status: "AUTHORISED",
          Contact: {
            Name: process.env.XERO_CONTACT_NAME || "Book My Tech",
            EmailAddress: process.env.XERO_CONTACT_EMAIL || undefined,
          },
          Date: today,
          DueDate: today,
          CurrencyCode: "GBP",
          LineAmountTypes: "Exclusive",
          Reference: paymentId,
          LineItems: [
            {
              Description: `SMS Credits (${credits} credits)`,
              Quantity: 1,
              UnitAmount: amountGBP,
              AccountCode: process.env.XERO_SALES_ACCOUNT_CODE || "200",
            },
          ],
        },
      ],
    }),
  });
  const data = await res.json();
  const invoice = data?.Invoices?.[0];
  if (!res.ok || !invoice?.InvoiceID) throw new Error(`Xero invoice create error: ${JSON.stringify(data)}`);
  return invoice.InvoiceID as string;
}

async function markPaid(
  token: string,
  tenantId: string,
  invoiceId: string,
  bankAccountId: string,
  amountGBP: number,
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch("https://api.xero.com/api.xro/2.0/Payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-Tenant-Id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Payments: [
        { Invoice: { InvoiceID: invoiceId }, Account: { AccountID: bankAccountId }, Amount: amountGBP, Date: today },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Xero payment record error: ${JSON.stringify(data)}`);
}

/** Create + pay a Xero invoice for a confirmed top-up. No-op if Xero unconfigured.
 *  Throws on Xero errors — the caller must treat them as non-fatal. */
export async function raiseTopUpInvoice(
  amountPaidPence: number,
  credits: number,
  paymentId: string,
): Promise<{ skipped: true } | { skipped: false; invoiceId: string }> {
  const id = process.env.XERO_CLIENT_ID;
  const secret = process.env.XERO_CLIENT_SECRET;
  if (!id || !secret) return { skipped: true };

  const token = await getAccessToken(id, secret);
  const tenantId = await getTenantId(token);
  const bankAccountId = await getBankAccountId(token, tenantId);
  const amountGBP = amountPaidPence / 100;
  const invoiceId = await createInvoice(token, tenantId, amountGBP, credits, paymentId);
  await markPaid(token, tenantId, invoiceId, bankAccountId, amountGBP);
  return { skipped: false, invoiceId };
}
