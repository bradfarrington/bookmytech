// How a mechanic-side core says no, shared by the cores behind the mechanic
// app's job routes (Task 67). The website shows `error` and ignores `code`; the
// mobile routes turn `code` into a status (lib/mobile/mechanic-actions.ts):
//
//   invalid    400  the request itself is wrong — a bad mileage, an unknown answer
//   forbidden  403  not this mechanic's job, photo, quote or part
//   not_found  404  no such thing
//   conflict   409  right caller, wrong moment — the job has moved on, a
//                   checklist is unfinished, the payment didn't go through
//   failed     500  it should have worked. `error` is the database's wording,
//                   so the routes log it and say something else.
//
// Same idea as OfferRefusalCode (./offers.ts), which came first.

export type MechanicRefusalCode = "invalid" | "forbidden" | "not_found" | "conflict" | "failed";

export interface MechanicRefusal {
  ok: false;
  code: MechanicRefusalCode;
  error: string;
}

export function refuse(code: MechanicRefusalCode, error: string): MechanicRefusal {
  return { ok: false, code, error };
}
