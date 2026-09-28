// Money is handled in integer cents (BigInt for products and sums) so totals never
// pick up float drift such as 3 * 0.1 = 0.30000000000000004.

// Float-safe: 1.1 * 100 is 110.00000000000001, which must still count as 2 decimals.
export function hasAtMostTwoDecimals(amount) {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

// Accepts a number or a DECIMAL string from Postgres ("12.50").
export function toCents(value) {
  return BigInt(Math.round(Number(value) * 100));
}

// quantity x unitPrice, rounded half-up to whole cents.
export function lineTotalCents(quantity, unitPrice) {
  return (toCents(quantity) * toCents(unitPrice) + 50n) / 100n;
}

export function centsToString(cents) {
  const digits = cents.toString().padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
