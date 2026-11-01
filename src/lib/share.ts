export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Opens the share sheet with a file (WhatsApp, Files, AirDrop…), or downloads it on desktop. */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
  const data = { files: [file], title };
  if (typeof navigator.canShare === 'function' && navigator.canShare(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Some browsers refuse certain file types: fall back to a download.
    }
  }
  download(file);
  return 'downloaded';
}

export function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Lets the person pick a file. Resolves null if they cancel. */
export function pickFile(accept?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // iOS greys out files with unknown extensions when `accept` is set, so leave it open there.
    if (accept) input.accept = accept;
    input.style.display = 'none';
    let done = false;
    input.addEventListener('change', () => {
      done = true;
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      if (!done) resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'household'
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
