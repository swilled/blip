const SUBMIT_METHOD_GUARD_SENTINEL = "blip-submit-method-guard-v1";
const SUBMIT_METHOD_GUARD_PROPERTY = "__blipSubmitMethodGuardInstalled";

type SubmitMethodGuardGlobal = typeof globalThis & {
  __blipSubmitMethodGuardInstalled?: unknown;
};

/** Install the immutable page-world wrapper as soon as this document-start entry runs. */
export function installSubmitMethodGuard(target: Window & typeof globalThis): void {
  const formConstructor = target.HTMLFormElement;
  if (typeof formConstructor !== "function") return;

  const scope = target as SubmitMethodGuardGlobal;
  const current = Object.getOwnPropertyDescriptor(formConstructor.prototype, "submit");
  if (scope[SUBMIT_METHOD_GUARD_PROPERTY] === SUBMIT_METHOD_GUARD_SENTINEL &&
      current?.configurable === false && current.writable === false && typeof current.value === "function") {
    return;
  }

  Object.defineProperty(formConstructor.prototype, "submit", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function submit(): void {
      // Direct submit deliberately has no path to the captured browser implementation.
    },
  });
  Object.defineProperty(scope, SUBMIT_METHOD_GUARD_PROPERTY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: SUBMIT_METHOD_GUARD_SENTINEL,
  });
}

if (typeof window !== "undefined" && typeof window.HTMLFormElement === "function") {
  installSubmitMethodGuard(window);
}
