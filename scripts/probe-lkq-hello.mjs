#!/usr/bin/env node
// Task 41 — LKQ ECP connectivity probe. NEEDS NO CREDENTIALS.
//
// Calls the WSDL's HelloFromLkq operation, which returns the service version
// and server time. If this succeeds but probe-lkq-price.mjs fails, the problem
// is the credentials or the account, not the network or an IP allowlist.
//
//   node scripts/probe-lkq-hello.mjs
//
// Honours LKQ_ECP_PRICE_URL if set; otherwise hits the documented test host.

import dotenv from "dotenv";
import { helloFromLkq } from "./lib/lkq-soap.mjs";

dotenv.config({ path: ".env.local" });

const url = (
  process.env.LKQ_ECP_PRICE_URL || "https://apiplus1test.lkqbodyshop.com/ApiPlusPriceSvc.svc"
).replace(/\/+$/, "");

console.log(`LKQ ECP Pricing service: ${url}`);
try {
  const greeting = await helloFromLkq(url);
  console.log(`\n  ${greeting}\n`);
  console.log("Reachable. SOAP envelope, namespace and SOAPAction all accepted.");
} catch (err) {
  console.error(`\nUnreachable or rejected: ${err.message}\n`);
  process.exit(1);
}
