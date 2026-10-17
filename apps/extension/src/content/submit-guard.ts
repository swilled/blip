type GuardState = {
  count: number;
  listener: (event: Event) => void;
};

const guards = new WeakMap<Document, GuardState>();

/** Suppress submit events for the complete lifetime of one or more page acts. */
export async function withSubmitEventsBlocked<T>(document: Document, act: () => T | Promise<T>): Promise<T> {
  let state = guards.get(document);
  if (!state) {
    const listener = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    state = { count: 0, listener };
    guards.set(document, state);
    document.addEventListener("submit", listener, true);
  }
  state.count += 1;

  try {
    return await act();
  } finally {
    state.count -= 1;
    if (state.count === 0) {
      document.removeEventListener("submit", state.listener, true);
      guards.delete(document);
    }
  }
}
