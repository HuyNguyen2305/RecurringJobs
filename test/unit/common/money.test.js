import { hasAtMostTwoDecimals, toCents, lineTotalCents, centsToString } from '#common/money.js';

describe('hasAtMostTwoDecimals', () => {
  it.each([0, 1, 1.1, 12.34, 0.29, 99999999.99])('accepts %p', (amount) => {
    expect(hasAtMostTwoDecimals(amount)).toBe(true);
  });

  it.each([12.345, 0.001, 1.999])('rejects %p', (amount) => {
    expect(hasAtMostTwoDecimals(amount)).toBe(false);
  });
});

describe('toCents', () => {
  it('converts numbers and DECIMAL strings to exact cents', () => {
    expect(toCents(0.29)).toBe(29n);
    expect(toCents('45.50')).toBe(4550n);
    expect(toCents(99999999.99)).toBe(9999999999n);
  });
});

describe('lineTotalCents', () => {
  it('multiplies without float drift and rounds half-up', () => {
    expect(lineTotalCents(3, 0.1)).toBe(30n);
    expect(lineTotalCents('1.50', '0.33')).toBe(50n); // 0.495 -> 0.50
  });

  it('stays exact beyond the Number safe-integer range', () => {
    // 99,999,999.99 x 99,999,999.99 = 9,999,999,998,000,000.0001 -> ...000,000.00
    expect(centsToString(lineTotalCents(99999999.99, 99999999.99))).toBe('9999999998000000.00');
  });
});

describe('centsToString', () => {
  it.each([
    [0n, '0.00'],
    [5n, '0.05'],
    [30n, '0.30'],
    [123456n, '1234.56'],
  ])('formats %p as %p', (cents, expected) => {
    expect(centsToString(cents)).toBe(expected);
  });
});
