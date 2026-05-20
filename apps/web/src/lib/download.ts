type DownloadPayload = {
  filename: string;
  mimeType: string;
  content: string | Blob;
};

/**
 * Browser-side file download. Wraps Blob + object URL + anchor click so the
 * caller doesn't have to repeat the boilerplate. Safe to call only on the
 * client.
 */
export function downloadFile({
  filename,
  mimeType,
  content,
}: DownloadPayload): void {
  if (typeof window === "undefined") {
    throw new Error("downloadFile must be called in the browser");
  }

  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
