/**
 * Compute the SHA-256 hex digest of a Blob/File using the browser's
 * Web Crypto API. We use this as the dedupe key so re-uploading the
 * same MT5 export is a no-op rather than a duplicate row.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
