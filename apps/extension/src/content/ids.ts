export type ElementIdRegistry = {
  idFor(element: Element, fingerprint: string): string;
  resolve(id: string): Element | null;
  clear(): void;
};

/** Keeps authority in private maps; the page-visible attribute is only a debug stamp. */
export function createIdRegistry(): ElementIdRegistry {
  const elementIds = new WeakMap<Element, string>();
  const elementsById = new Map<string, WeakRef<Element>>();
  const fingerprintsById = new Map<string, string>();
  const idsByFingerprint = new Map<string, Set<string>>();
  let nextId = 1;

  function rememberFingerprint(id: string, fingerprint: string): void {
    const oldFingerprint = fingerprintsById.get(id);
    if (oldFingerprint !== undefined && oldFingerprint !== fingerprint) {
      const oldIds = idsByFingerprint.get(oldFingerprint);
      oldIds?.delete(id);
      if (oldIds?.size === 0) idsByFingerprint.delete(oldFingerprint);
    }
    fingerprintsById.set(id, fingerprint);
    let ids = idsByFingerprint.get(fingerprint);
    if (!ids) {
      ids = new Set();
      idsByFingerprint.set(fingerprint, ids);
    }
    ids.add(id);
  }

  function stamp(element: Element, id: string): string {
    elementsById.set(id, new WeakRef(element));
    elementIds.set(element, id);
    // Never read this page-controlled attribute back to resolve an element.
    element.setAttribute("data-blip-id", id);
    return id;
  }

  return {
    idFor(element, fingerprint) {
      const previous = elementIds.get(element);
      if (previous && elementsById.get(previous)?.deref() === element) {
        rememberFingerprint(previous, fingerprint);
        return stamp(element, previous);
      }

      for (const candidateId of idsByFingerprint.get(fingerprint) ?? []) {
        const candidate = elementsById.get(candidateId)?.deref();
        if (!candidate || (candidate !== element && !candidate.isConnected)) {
          rememberFingerprint(candidateId, fingerprint);
          return stamp(element, candidateId);
        }
      }

      let id: string;
      do {
        id = `e${nextId}`;
        nextId += 1;
      } while (elementsById.has(id));
      rememberFingerprint(id, fingerprint);
      return stamp(element, id);
    },
    resolve(id) {
      const element = elementsById.get(id)?.deref();
      if (!element || !element.isConnected) {
        elementsById.delete(id);
        return null;
      }
      return element;
    },
    clear() {
      elementsById.clear();
      fingerprintsById.clear();
      idsByFingerprint.clear();
    },
  };
}
