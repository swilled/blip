// Pinned extension identity (D-05). Generated once by `npm run gen:extension-key`.
//
// EXTENSION_PUBLIC_KEY is the manifest `key` value (base64 SubjectPublicKeyInfo DER). Chrome derives
// the extension id from it, so every developer's unpacked build gets the same id and the server's
// Origin allowlist can name it. The matching private key was discarded and is not needed: it only
// signs a store package, which is out of scope. Regenerating the key changes the id and forces
// everyone to reload the extension, so do not.
//
// Strings only: no Node imports, so this stays browser- and service-worker-safe.

export const EXTENSION_PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuVCij1bIwozGkNLKfbdB5bvNP+CnMdJSKRtQPHaeKq4PGAznrZejdMrGyrTnG8Uii1j5YSZVmCPsZB1nBLm/GGQ8ggZsAodFfP6o1ez90T88Hc24uFX/sCTWX4/mpcQgNhKVZMbXvyiS/a87bBvbWcgYJqTQk7ce0+a+7kzmYVhhQwL11vexARvSeFAzuiKBkfVthfdbjOS2BGD8kV1Ie5pWJLcCp5xAM6SEl4TymJqfmNkOEBae0gvyoFELTbsFrknRNp1V3bvyQW8PYzoOL21k+O/y8/+Y/U/M7vqFBfLrUsfXtK/LscwSpPBayjUnq6vxcaQum3ilsF0VYt8oiQIDAQAB";

export const EXTENSION_ID = "gipmmdbdhebfpfoabhdpkenijaljeclp";

/** The Origin header a Chrome extension page or service worker sends. */
export function extensionOrigin(id: string = EXTENSION_ID): string {
  return `chrome-extension://${id}`;
}
