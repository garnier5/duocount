// Months are keyed "YYYY-MM", days "YYYY-MM-DD", both in local time.
export type MonthKey = string;
export type DateKey = string;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

export function monthKey(d: Date = new Date()): MonthKey {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

export function dateKey(d: Date = new Date()): DateKey {
  return monthKey(d) + '-' + pad(d.getDate());
}

export function parseMonth(m: MonthKey): { y: number; m: number } {
  const [y, mm] = m.split('-').map(Number);
  return { y, m: mm };
}

export function parseDate(d: DateKey): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function addMonths(m: MonthKey, delta: number): MonthKey {
  const { y, m: mm } = parseMonth(m);
  const d = new Date(y, mm - 1 + delta, 1);
  return monthKey(d);
}

export function monthOf(d: DateKey): MonthKey {
  return d.slice(0, 7);
}

export function daysInMonth(m: MonthKey): number {
  const { y, m: mm } = parseMonth(m);
  return new Date(y, mm, 0).getDate();
}

export function lastDayOf(m: MonthKey): DateKey {
  return m + '-' + pad(daysInMonth(m));
}

export function dayOf(m: MonthKey, day: number): DateKey {
  return m + '-' + pad(Math.min(Math.max(1, day), daysInMonth(m)));
}

/** "October 2026" */
export function monthName(m: MonthKey): string {
  const { y, m: mm } = parseMonth(m);
  return MONTHS[mm - 1] + ' ' + y;
}

/** "October" */
export function monthShort(m: MonthKey): string {
  return MONTHS[parseMonth(m).m - 1];
}

/** "Oct" */
export function monthAbbr(m: MonthKey): string {
  return MONTHS[parseMonth(m).m - 1].slice(0, 3);
}

export const MONTH_NAMES = MONTHS;

/** "Oct 12" */
export function shortDay(d: DateKey): string {
  const date = parseDate(d);
  return MONTHS[date.getMonth()].slice(0, 3) + ' ' + date.getDate();
}

/** "October 1, 2026" */
export function fullDate(ts: number): string {
  const d = new Date(ts);
  return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

/** "Oct 10, 9:42 PM" */
export function dateTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + time;
}

/** "Oct 12 at 8:15 PM" */
export function dateAtTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ' at ' + time;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", "Oct 3" */
export function ago(ts: number, now = Date.now(), long = false): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return long ? plural(min, 'minute') + ' ago' : min + ' min ago';
  const h = Math.round(min / 60);
  if (h < 24) return long ? plural(h, 'hour') + ' ago' : h + ' h ago';
  const d = Math.round(h / 24);
  if (d < 30) return long ? plural(d, 'day') + ' ago' : d + ' d ago';
  return shortDay(dateKey(new Date(ts)));
}

/** "1st", "2nd", "5th" */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function plural(n: number, word: string, pluralWord = word + 's'): string {
  return n + ' ' + (n === 1 ? word : pluralWord);
}
