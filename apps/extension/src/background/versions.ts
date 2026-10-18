type VersionEntry = { signature: string; version: number };

export interface SnapshotVersionTracker {
  next(tabId: number, signature: string): number;
  forget(tabId: number): void;
}

/** In-memory per-tab version history. Signatures are structural metadata only, never field values. */
export function createSnapshotVersionTracker(): SnapshotVersionTracker {
  const entries = new Map<number, VersionEntry>();

  return {
    next(tabId, signature) {
      const previous = entries.get(tabId);
      if (!previous) {
        entries.set(tabId, { signature, version: 1 });
        return 1;
      }
      if (previous.signature === signature) return previous.version;
      const version = previous.version + 1;
      entries.set(tabId, { signature, version });
      return version;
    },
    forget(tabId) {
      entries.delete(tabId);
    },
  };
}

export const snapshotVersions = createSnapshotVersionTracker();
