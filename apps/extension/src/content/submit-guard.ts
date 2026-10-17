type GuardState = {
  count: number;
  target: Window | Document;
  listener: (event: Event) => void;
};

const guards = new WeakMap<Document, GuardState>();

/** Suppress submit events for the complete lifetime of one or more page acts. */
export async function withSubmitEventsBlocked<T>(document: Document, act: () => T | Promise<T>): Promise<T> {
  let state = guards.get(document);
  if (!state) {
    const target = document.defaultView ?? document;
    const listener = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    state = { count: 0, target, listener };
    guards.set(document, state);
    target.addEventListener("submit", listener, true);
  }
  state.count += 1;

  try {
    return await act();
  } finally {
    state.count -= 1;
    if (state.count === 0) {
      state.target.removeEventListener("submit", state.listener, true);
      guards.delete(document);
    }
  }
}
