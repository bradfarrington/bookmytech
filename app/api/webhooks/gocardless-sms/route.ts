import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { raiseTopUpInvoice } from "@/lib/sms/xero";

// GoCardless payment-confirmed webhook (Task 13 Stage B). When a top-up payment
// is confirmed, credits are added idempotently and (optionally) a paid Xero
// invoice is raised. GoCardless sends no JWT — the route is public and
// authenticated by verifying the Webhook-Signature HMAC against the raw body
// (mirrors the Stripe webhook's raw-body pattern).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gocardlessBaseUrl(): string {
  return process.env.GOCARDLESS_ENVIRONMENT === "live"
    ? "https://api.gocardless.com"
    : "https://api-sandbox.gocardless.com";
}

export async function POST(req: NextRequest) {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  const accessToken = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!secret || !accessToken) {
    console.error("gocardless-sms webhook: GOCARDLESS_WEBHOOK_SECRET / ACCESS_TOKEN not set");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  // Read the RAW body for HMAC — never parse JSON first (consuming the stream
  // would make the signature unverifiable).
  const raw = await req.text();
  const signature = req.headers.get("webhook-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const valid =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    console.error("gocardless-sms webhook: signature mismatch");
    return new NextResponse("Invalid signature", { status: 400 });
  }

  let parsed: { events?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const events = Array.isArray(parsed.events) ? parsed.events : [];
  const admin = createAdminClient();
  const base = gocardlessBaseUrl();
  const gcHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "GoCardless-Version": process.env.GOCARDLESS_API_VERSION || "2015-07-06",
    Accept: "application/json",
  };

  for (const ev of events as Array<{
    resource_type?: string;
    action?: string;
    links?: { payment?: string };
  }>) {
    if (ev?.resource_type !== "payments" || ev?.action !== "confirmed") continue;
    const paymentId = ev?.links?.payment;
    if (!paymentId) {
      console.warn("gocardless-sms: confirmed event without payment id");
      continue;
    }

    // Re-fetch the payment to read amount + metadata authoritatively — never
    // trust the webhook body for money.
    const payRes = await fetch(`${base}/payments/${paymentId}`, { headers: gcHeaders });
    const payData = await payRes.json();
    if (!payRes.ok) {
      console.error("gocardless-sms: payment fetch failed", paymentId, payData);
      continue;
    }

    const payment = payData?.payments;
    const metadata = payment?.metadata ?? {};
    if (metadata.product !== "sms_credits") continue; // not our product
    const credits = Number(metadata.credits || 0);
    if (!credits || credits <= 0) {
      console.warn("gocardless-sms: missing/invalid credits in metadata", paymentId);
      continue;
    }
    const amountPaidPence = Number(payment?.amount || 0);

    // Idempotency: bail if this payment was already processed (the unique index
    // also guards against racing deliveries).
    const { data: existing } = await admin
      .from("sms_credit_purchases")
      .select("id")
      .eq("gocardless_payment_id", paymentId)
      .maybeSingle();
    if (existing) {
      console.log(`gocardless-sms: payment ${paymentId} already processed, skipping`);
      continue;
    }

    // Top up the balance + re-arm the low-credit alert.
    const { data: settings } = await admin
      .from("sms_settings")
      .select("sms_credits_balance")
      .eq("id", 1)
      .single();
    await admin
      .from("sms_settings")
      .update({
        sms_credits_balance: (settings?.sms_credits_balance ?? 0) + credits,
        sms_low_credit_notified: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    // Record the purchase (unique index on payment id guards races).
    const { error: insertErr } = await admin.from("sms_credit_purchases").insert({
      credits_purchased: credits,
      amount_paid_pence: amountPaidPence,
      gocardless_payment_id: paymentId,
      status: "completed",
    });
    if (insertErr) {
      console.error("gocardless-sms: purchase insert failed", paymentId, insertErr);
      continue;
    }
    console.log(`gocardless-sms: added ${credits} credits via payment ${paymentId}`);

    // Xero invoice — non-fatal. Credits are already granted.
    try {
      const result = await raiseTopUpInvoice(amountPaidPence, credits, paymentId);
      if (!result.skipped) console.log(`gocardless-sms: Xero invoice ${result.invoiceId} raised`);
    } catch (xeroErr) {
      console.error("gocardless-sms: Xero error (non-fatal)", paymentId, xeroErr);
    }
  }

  return NextResponse.json({ received: true });
}
