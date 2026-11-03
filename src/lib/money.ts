// All amounts are stored as integer cents to avoid floating point drift.
export type Cents = number;

export const MINUS = '−';

let currency = 'EUR';
const formatters = new Map<string, Intl.NumberFormat>();

export function setCurrency(code: string) {
  currency = code;
}

export function getCurrency() {
  return currency;
}

function formatter() {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f;
}

export interface MoneyOptions {
  /** Prefix positive amounts with "+". */
  sign?: boolean;
}

/** Always to the cent, never rounded: "€2,213.50", "−€68.50", "+€82.40", "€1,150.00". */
export function money(cents: Cents, opts: MoneyOptions = {}): string {
  const negative = cents < 0;
  const text = formatter().format(Math.abs(cents) / 100);
  if (negative) return MINUS + text;
  if (opts.sign && cents > 0) return '+' + text;
  return text;
}

/**
 * A share of a total before it is split to the cent, which can have fractions of a cent:
 * "€1,050.006". Shown next to the rounded amount so the rounding is visible.
 */
export function moneyExact(cents: number): string {
  const f = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return (cents < 0 ? MINUS : '') + f.format(Math.abs(cents) / 100);
}

/** What a member's part of a total would be without cent rounding. */
export function exactPart(total: Cents, pct: number, sumPct = 100): number {
  return sumPct > 0 ? (total * pct) / sumPct : 0;
}

/**
 * A percentage that never hides a difference: "100%" only when it is exactly 100,
 * otherwise one decimal ("104.3%"), or two when one would look exact ("99.96%").
 */
export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  const v = (part / whole) * 100;
  if (Number.isInteger(v)) return v + '%';
  let t = v.toFixed(1);
  if (Number.isInteger(Number(t))) t = v.toFixed(2);
  return t + '%';
}

/** Plain number without currency symbol, as copied to a banking app: "1543.60". */
export function plainAmount(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

/** "1,150.00" (used in tables and Excel previews). */
export function groupedAmount(cents: Cents): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Currency symbol on its own, e.g. "€". */
export function currencySymbol(): string {
  const part = formatter()
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part ? part.value : currency;
}

/**
 * Parses what people type into an amount field. Accepts "1,150.50", "54,98" (comma
 * decimal from a French keyboard), "€ 12", "12.5". Returns null when nothing usable.
 */
export function parseAmount(input: string): Cents | null {
  let s = String(input).replace(/[^0-9.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the last one is the decimal separator.
    if (lastDot > lastComma) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const commas = (s.match(/,/g) || []).length;
    if (commas === 1 && decimals > 0 && decimals <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) {
      const decimals = s.length - lastDot - 1;
      s = decimals === 3 ? s.replace(/\./g, '') : s.slice(0, lastDot).replace(/\./g, '') + s.slice(lastDot);
    }
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Value to show back in an editable amount field: "54.98", "" for null. */
export function amountInput(cents: Cents | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/**
 * Splits a total between members by percentage, in cents, so that the parts always
 * add up to the total exactly (largest remainder method).
 */
export function splitByShares(total: Cents, shares: { id: string; pct: number }[]): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  const sumPct = shares.reduce((a, s) => a + s.pct, 0);
  if (sumPct <= 0) {
    shares.forEach((s) => (out[s.id] = 0));
    return out;
  }
  let allocated = 0;
  const rema: { id: string; r: number }[] = [];
  for (const s of shares) {
    const exact = (total * s.pct) / sumPct;
    const floor = Math.floor(exact);
    out[s.id] = floor;
    allocated += floor;
    rema.push({ id: s.id, r: exact - floor });
  }
  rema.sort((a, b) => b.r - a.r);
  let left = total - allocated;
  for (let i = 0; left > 0 && i < rema.length; i++, left--) out[rema[i].id] += 1;
  return out;
}
