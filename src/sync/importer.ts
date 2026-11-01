import { FileTooBig, MAX_FILE_BYTES, readHeader, type OpenedFile } from './crypto';

/** The file the person just picked, waiting to be unlocked on the Import screen. */
let pending: OpenedFile | null = null;

export async function loadFile(file: File): Promise<OpenedFile> {
  // Checked before reading: the whole file would otherwise land in memory.
  if (file.size > MAX_FILE_BYTES) throw new FileTooBig();
  const text = await file.text();
  return readHeader(text, file.name, file.size);
}

export function setPending(f: OpenedFile | null) {
  pending = f;
}

export function getPending(): OpenedFile | null {
  return pending;
}
