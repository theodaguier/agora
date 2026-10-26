/** A preview can move from the composer into a pending message without losing its image. */
const references = new Map<string, { count: number; revoke: () => void }>();

function release(url: string) {
  const reference = references.get(url);
  if (!reference) return;
  if (reference.count > 1) reference.count--;
  else {
    references.delete(url);
    reference.revoke();
  }
}

export class PreviewUrls {
  private owned = new Set<string>();
  create(file: Blob): string {
    const url = URL.createObjectURL(file);
    references.set(url, { count: 1, revoke: () => URL.revokeObjectURL(url) });
    this.owned.add(url);
    return url;
  }
  /** Called synchronously by the receiver before the sender releases its previews. */
  adopt(url: string | undefined) {
    if (!url || this.owned.has(url)) return;
    const reference = references.get(url);
    if (!reference) return;
    reference.count++;
    this.owned.add(url);
  }
  remove(url: string | undefined) {
    if (url && this.owned.delete(url)) release(url);
  }
  keep(urls: Iterable<string | undefined>) {
    const retained = new Set(urls);
    for (const url of this.owned) if (!retained.has(url)) this.remove(url);
  }
  clear() {
    for (const url of this.owned) release(url);
    this.owned.clear();
  }
}
