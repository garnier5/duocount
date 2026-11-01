// The household password, made and kept by the household's password manager.
// (In the code it is still called the passphrase: the file format and stored names didn't change.)

/** Lowercase only: the app ignores capitals, so they would add nothing. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-_.!@#$%&*+=?';

/** Shapes the strong password Safari suggests: the app ignores capitals and spaces. */
export const PASSWORD_RULES = 'minlength: 20; required: lower; required: digit; allowed: upper, [-_.!@#$%&*+=?];';

function randomInt(max: number): number {
  // Rejection sampling keeps every character equally likely.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** For when the password manager doesn't suggest one itself: about 135 bits. */
export function generatePassword(length = 24): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** What's still missing before a new household password can be used, if anything. */
export function newPasswordProblem(value: string, saved: boolean): string | null {
  if (!value.trim()) return 'Fill in a password: tap the field to let your password manager suggest one, or tap Generate one.';
  if (passphraseStrength(value).level < 3) return 'This password is too weak. Let your password manager make one, or tap Generate one.';
  if (!saved) return 'Tick the box once the password is saved in your password manager.';
  return null;
}

export type Strength = { level: 0 | 1 | 2 | 3 | 4; label: string };

/** Rough strength estimate for a password people type or paste themselves. */
export function passphraseStrength(p: string): Strength {
  const s = p.trim();
  if (!s) return { level: 0, label: 'Fill in a password' };
  const pieces = s.split(/[\s\-_.,]+/).filter(Boolean);
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/[0-9]/.test(s)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(s)) pool += 20;
  const charBits = s.length * Math.log2(Math.max(pool, 1)) * 0.5;
  const wordBits = pieces.length >= 3 ? pieces.length * 9 : 0;
  const bits = Math.max(charBits, wordBits);
  if (s.length < 10 || bits < 30) return { level: 1, label: 'Too weak · let your password manager make one' };
  if (bits < 40) return { level: 2, label: 'Fair · make it longer' };
  if (bits < 50) return { level: 3, label: 'Strong' };
  return { level: 4, label: 'Very strong' };
}
