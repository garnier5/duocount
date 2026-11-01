import { Gunzip, gzipSync, strFromU8, strToU8 } from 'fflate';

/**
 * Encrypted household files (.duocount).
 * The passphrase is stretched with PBKDF2-SHA-256, the content is gzipped then
 * sealed with AES-256-GCM, so a wrong passphrase or a tampered file is detected.
 * Only the header (who sent it, when) is readable without the passphrase.
 */

export const FILE_EXTENSION = '.duocount';
const ITERATIONS = 600_000;
/** The count is read from the file before anything else is checked: more would freeze the phone. */
const MAX_ITERATIONS = 2_000_000;
/** Far above what a household writes, far below what would choke a phone. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;

export interface FileHeader {
  app: 'duocount';
  v: 1;
  kind: 'sync' | 'backup';
  householdId: string;
  householdName: string;
  from: { memberId: string; name: string };
  sentAt: number;
}

interface FileEnvelope extends FileHeader {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  data: string;
}

export class NotDuoCountFile extends Error {
  constructor() {
    super("This file isn't a DuoCount file.");
  }
}

export class WrongPassphrase extends Error {
  constructor() {
    super('Wrong passphrase.');
  }
}

export class FileTooBig extends Error {
  constructor() {
    super('This file is too big to be a DuoCount file.');
  }
}

/** Same passphrase whatever the keyboard did (capital first letter, extra spaces). */
export function normalizePassphrase(p: string): string {
  return p.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Header fields in a fixed order, authenticated along with the content. */
function aadOf(h: FileHeader): Uint8Array<ArrayBuffer> {
  return strToU8(JSON.stringify([h.app, h.v, h.kind, h.householdId, h.householdName, h.from.memberId, h.from.name, h.sentAt])) as Uint8Array<ArrayBuffer>;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', strToU8(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
}

export async function sealFile(header: FileHeader, payload: unknown, passphrase: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plain = gzipSync(strToU8(JSON.stringify(payload)), { level: 9 });
  // The header is bound to the ciphertext so it can't be swapped onto another file.
  const aad = aadOf(header);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plain));
  const env: FileEnvelope = {
    ...header,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    iv: toB64(iv),
    data: toB64(cipher)
  };
  return JSON.stringify(env);
}

export interface OpenedFile {
  header: FileHeader;
  envelope: FileEnvelope;
  size: number;
  fileName: string;
}

export function readHeader(text: string, fileName = '', size = text.length): OpenedFile {
  let env: FileEnvelope;
  try {
    env = JSON.parse(text);
  } catch {
    throw new NotDuoCountFile();
  }
  if (!env || env.app !== 'duocount' || env.v !== 1 || typeof env.data !== 'string' || typeof env.iv !== 'string') throw new NotDuoCountFile();
  const kdf = env.kdf;
  if (
    !kdf ||
    kdf.name !== 'PBKDF2' ||
    kdf.hash !== 'SHA-256' ||
    typeof kdf.salt !== 'string' ||
    !Number.isSafeInteger(kdf.iterations) ||
    kdf.iterations < 1 ||
    kdf.iterations > MAX_ITERATIONS
  )
    throw new NotDuoCountFile();
  // The header is shown before the file is unlocked, so it must at least have the right shape.
  const { kind, householdId, householdName, from, sentAt } = env;
  if (
    (kind !== 'sync' && kind !== 'backup') ||
    typeof householdId !== 'string' ||
    typeof householdName !== 'string' ||
    !from ||
    typeof from.memberId !== 'string' ||
    typeof from.name !== 'string' ||
    typeof sentAt !== 'number'
  )
    throw new NotDuoCountFile();
  const header: FileHeader = {
    app: env.app,
    v: env.v,
    kind: env.kind,
    householdId: env.householdId,
    householdName: env.householdName,
    from: env.from,
    sentAt: env.sentAt
  };
  return { header, envelope: env, size, fileName };
}

const CHECK_TEXT = 'duocount-passphrase-check';

/**
 * A small sealed value that tells whether a typed passphrase is the household's,
 * so the phone never has to keep the passphrase itself. Guessing the passphrase
 * from it costs as much as from any file already sent on WhatsApp.
 */
export async function makeCheck(passphrase: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, strToU8(CHECK_TEXT) as Uint8Array<ArrayBuffer>));
  return JSON.stringify({ iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(data) });
}

export async function matchesCheck(check: string, passphrase: string): Promise<boolean> {
  try {
    const c = JSON.parse(check) as { iterations: number; salt: string; iv: string; data: string };
    const key = await deriveKey(passphrase, fromB64(c.salt), c.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(c.iv) }, key, fromB64(c.data));
    return strFromU8(new Uint8Array(plain)) === CHECK_TEXT;
  } catch {
    return false;
  }
}

export async function openFile<T>(file: OpenedFile, passphrase: string): Promise<T> {
  const env = file.envelope;
  const key = await deriveKey(passphrase, fromB64(env.kdf.salt), env.kdf.iterations);
  let plain: Uint8Array;
  try {
    const aad = aadOf(file.header);
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv), additionalData: aad }, key, fromB64(env.data)));
  } catch {
    throw new WrongPassphrase();
  }
  return JSON.parse(strFromU8(gunzipCapped(plain, MAX_CONTENT_BYTES))) as T;
}

/** Gunzips in small steps, so a crafted file can't expand without bound before it's stopped. */
export function gunzipCapped(data: Uint8Array, max: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const g = new Gunzip((chunk) => {
    size += chunk.length;
    if (size > max) throw new FileTooBig();
    chunks.push(chunk);
  });
  const step = 16 * 1024;
  for (let i = 0; i < data.length; i += step) g.push(data.subarray(i, i + step), i + step >= data.length);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
