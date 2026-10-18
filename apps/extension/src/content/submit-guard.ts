const SUBMIT_GUARD_REGISTRY_KEY = "__blipPersistentSubmitGuardRegistry";

type SubmitAllowance = {
  token: object;
  form: HTMLFormElement;
  submitter: HTMLElement | null;
};

type GuardState = {
  installed: true;
  target: EventTarget;
  listener: (event: Event) => void;
  allowance?: SubmitAllowance;
};

type SubmitGuardRegistry = {
  documents: WeakMap<Document, GuardState>;
};

type IsolatedGlobal = typeof globalThis & {
  __blipPersistentSubmitGuardRegistry?: SubmitGuardRegistry;
};

function registry(create: boolean): SubmitGuardRegistry | undefined {
  const isolatedGlobal = globalThis as IsolatedGlobal;
  const existing = isolatedGlobal[SUBMIT_GUARD_REGISTRY_KEY];
  if (existing && existing.documents instanceof WeakMap) return existing;
  if (!create) return undefined;

  const created: SubmitGuardRegistry = { documents: new WeakMap() };
  Object.defineProperty(isolatedGlobal, SUBMIT_GUARD_REGISTRY_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: created,
  });
  return created;
}

/** Install the default-deny submit listener once for this isolated-world document. */
export function installPersistentSubmitGuard(document: Document = globalThis.document): boolean {
  const documents = registry(true)!.documents;
  if (documents.get(document)?.installed === true) return true;

  const target: EventTarget = document.defaultView ?? document;
  const state: GuardState = {
    installed: true,
    target,
    listener: () => undefined,
  };
  state.listener = (event: Event) => {
    const allowance = state.allowance;
    if (allowance && event.target === allowance.form &&
        (event as SubmitEvent).submitter === allowance.submitter) {
      // Consume before page listeners run so reentrant submissions are denied.
      delete state.allowance;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  target.addEventListener("submit", state.listener, true);
  documents.set(document, state);
  return true;
}

/** True only when the isolated document-start bundle registered its persistent guard. */
export function isPersistentSubmitGuardInstalled(document: Document = globalThis.document): boolean {
  return registry(false)?.documents.get(document)?.installed === true;
}

/** Allow one event for exactly this form and submitter, then clear any unused allowance. */
export function beginOneSubmitAllowance(form: HTMLFormElement, submitter: HTMLElement | null): () => void {
  const state = registry(false)?.documents.get(form.ownerDocument);
  const hasFormAssociation = submitter === null ||
    ((submitter.localName === "button" || submitter.localName === "input") && "form" in submitter &&
      (submitter as HTMLButtonElement | HTMLInputElement).form === form);
  if (!state?.installed || !hasFormAssociation) {
    throw new Error("persistent submit guard is unavailable");
  }
  if (state.allowance) throw new Error("a submit allowance is already pending");

  const token = {};
  state.allowance = { token, form, submitter };
  return () => {
    if (state.allowance?.token === token) delete state.allowance;
  };
}

/** Acts only run after document-start guard state is present; the listener stays installed. */
export async function withSubmitEventsBlocked<T>(document: Document, act: () => T | Promise<T>): Promise<T> {
  if (!isPersistentSubmitGuardInstalled(document)) throw new Error("persistent submit guard is unavailable");
  return await act();
}
