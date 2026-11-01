import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { FileTooBig, gunzipCapped, makeCheck, matchesCheck, normalizePassphrase, NotDuoCountFile, openFile, readHeader, sealFile, WrongPassphrase, type FileHeader } from '../src/sync/crypto';
import { loadFile } from '../src/sync/importer';
import { generatePassword, newPasswordProblem, passphraseStrength } from '../src/sync/password';

const header: FileHeader = {
  app: 'duocount',
  v: 1,
  kind: 'sync',
  householdId: 'hh-1',
  householdName: 'The Duponts',
  from: { memberId: 'm-1', name: 'Camille' },
  sentAt: 1760000000000
};

describe('encrypted files', () => {
  it('round-trips with the right passphrase, whatever the capitals and spaces', async () => {
    const text = await sealFile(header, { records: [{ hello: 'world' }] }, 'sailboat-lemon-thunder-42', 1000);
    const file = readHeader(text, 'x.duocount');
    expect(file.header.from.name).toBe('Camille');
    const payload = await openFile<{ records: { hello: string }[] }>(file, '  Sailboat-Lemon-Thunder-42 ');
    expect(payload.records[0].hello).toBe('world');
  });

  it('rejects a wrong passphrase', async () => {
    const text = await sealFile(header, { a: 1 }, 'sailboat-lemon-thunder-42', 1000);
    await expect(openFile(readHeader(text), 'sailboat-lime-thunder-42')).rejects.toBeInstanceOf(WrongPassphrase);
  });

  it('rejects a header that was tampered with', async () => {
    const text = await sealFile(header, { a: 1 }, 'pass-phrase-words-12', 1000);
    const forged = text.replace('"Camille"', '"Mallory"');
    await expect(openFile(readHeader(forged), 'pass-phrase-words-12')).rejects.toBeInstanceOf(WrongPassphrase);
  });

  it('refuses files that are not DuoCount files', () => {
    expect(() => readHeader('hello')).toThrow();
    expect(() => readHeader('{"app":"other"}')).toThrow();
  });

  it('refuses a header with the wrong shape', async () => {
    const text = await sealFile(header, { a: 1 }, 'pass-phrase-words-12', 1000);
    const env = JSON.parse(text);
    expect(() => readHeader(JSON.stringify({ ...env, from: null }))).toThrow(NotDuoCountFile);
    expect(() => readHeader(JSON.stringify({ ...env, kind: 'other' }))).toThrow(NotDuoCountFile);
  });

  it('refuses a file asking for so many iterations it would freeze the phone', async () => {
    const env = JSON.parse(await sealFile(header, { a: 1 }, 'pass-phrase-words-12', 1000));
    expect(() => readHeader(JSON.stringify({ ...env, kdf: { ...env.kdf, iterations: 1e10 } }))).toThrow(NotDuoCountFile);
    expect(() => readHeader(JSON.stringify({ ...env, kdf: { ...env.kdf, iterations: 0 } }))).toThrow(NotDuoCountFile);
    expect(() => readHeader(JSON.stringify({ ...env, kdf: { ...env.kdf, iterations: '600000' } }))).toThrow(NotDuoCountFile);
  });

  it('refuses a file that is too big before reading it', async () => {
    const big = { size: 21 * 1024 * 1024, text: () => Promise.reject(new Error('should not be read')) } as unknown as File;
    await expect(loadFile(big)).rejects.toBeInstanceOf(FileTooBig);
  });

  it('stops decompressing content that expands too much', () => {
    const bomb = gzipSync(new Uint8Array(5 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(20_000);
    expect(() => gunzipCapped(bomb, 1024 * 1024)).toThrow(FileTooBig);
    expect(gunzipCapped(bomb, 10 * 1024 * 1024)).toHaveLength(5 * 1024 * 1024);
  });
});

describe('passphrase check', () => {
  it('recognises the passphrase without storing it', async () => {
    const check = await makeCheck('sailboat-lemon-thunder-42', 1000);
    expect(check).not.toContain('sailboat');
    expect(await matchesCheck(check, ' Sailboat-Lemon-Thunder-42')).toBe(true);
    expect(await matchesCheck(check, 'sailboat-lime-thunder-42')).toBe(false);
    expect(await matchesCheck('garbage', 'sailboat-lemon-thunder-42')).toBe(false);
  });
});

describe('household password', () => {
  it('generates long random passwords that survive normalisation', () => {
    const a = generatePassword();
    expect(a).toHaveLength(24);
    expect(a).toBe(normalizePassphrase(a));
    expect(generatePassword()).not.toBe(a);
    expect(passphraseStrength(a).level).toBe(4);
  });

  it('accepts what a password manager makes, whatever the capitals', async () => {
    const managed = 'xKv7#pQ2-mW9!rT4-zB6@nL8';
    expect(passphraseStrength(managed).level).toBe(4);
    const text = await sealFile(header, { a: 1 }, managed, 1000);
    expect(await openFile(readHeader(text), managed)).toEqual({ a: 1 });
  });

  it('says what is missing before a new password can be used', () => {
    expect(newPasswordProblem('', true)).toMatch(/Fill in a password/);
    expect(newPasswordProblem('abc', true)).toMatch(/too weak/);
    expect(newPasswordProblem(generatePassword(), false)).toMatch(/Tick the box/);
    expect(newPasswordProblem(generatePassword(), true)).toBeNull();
  });

  it('rates typed passwords', () => {
    expect(passphraseStrength('abc').level).toBe(1);
    expect(passphraseStrength('blue house garden river').level).toBeGreaterThanOrEqual(3);
  });
});
