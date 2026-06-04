// Pure parts-margin maths. No I/O so it's safe to import anywhere (admin UI,
// reporting) and unit-test. Everything is integer pence.
//
// "Margin" here is the platform's gross margin on a part: what BMT bills
// (bmt_price) minus what BMT pays the supplier (supplier_cost). The percentage
// is expressed against the sale price (gross margin %), which is the figure ops
// reason about when setting catalogue prices.

export function marginPence(supplierCostPence: number, bmtPricePence: number): number {
  return Math.max(0, Math.round(bmtPricePence) - Math.round(supplierCostPence));
}

/** Gross margin as a % of the BMT (sale) price, one decimal place. 0 if price is 0. */
export function marginPct(supplierCostPence: number, bmtPricePence: number): number {
  const price = Math.round(bmtPricePence);
  if (price <= 0) return 0;
  return Math.round((marginPence(supplierCostPence, bmtPricePence) / price) * 1000) / 10;
}

/** Markup as a % of supplier cost (how much is added on top of cost). 0 if cost is 0. */
export function markupPct(supplierCostPence: number, bmtPricePence: number): number {
  const cost = Math.round(supplierCostPence);
  if (cost <= 0) return 0;
  return Math.round((marginPence(supplierCostPence, bmtPricePence) / cost) * 1000) / 10;
}
