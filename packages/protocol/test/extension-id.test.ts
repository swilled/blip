import { createHash, createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXTENSION_ID, EXTENSION_PUBLIC_KEY, extensionOrigin } from "../src/index";

// T-01-08: the committed id must be derivable from the committed public key, using the same
// recipe the generator script uses (SHA-256 of the SPKI DER, first 16 bytes, nibbles to a-p).
function deriveId(publicKeyBase64: string): string {
  const der = Buffer.from(publicKeyBase64, "base64");
  const hex = createHash("sha256").update(der).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");
}

describe("pinned extension identity (D-05)", () => {
  it("EXTENSION_ID is 32 characters in a-p", () => {
    expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/);
  });

  it("EXTENSION_ID re-derives from EXTENSION_PUBLIC_KEY", () => {
    expect(deriveId(EXTENSION_PUBLIC_KEY)).toBe(EXTENSION_ID);
  });

  it("EXTENSION_PUBLIC_KEY decodes as a valid SPKI RSA public key", () => {
    const key = createPublicKey({ key: Buffer.from(EXTENSION_PUBLIC_KEY, "base64"), format: "der", type: "spki" });
    expect(key.type).toBe("public");
    expect(key.asymmetricKeyType).toBe("rsa");
  });

  it("extensionOrigin() is chrome-extension:// plus the id", () => {
    expect(extensionOrigin()).toBe(`chrome-extension://${EXTENSION_ID}`);
    expect(extensionOrigin("abc")).toBe("chrome-extension://abc");
  });
});
