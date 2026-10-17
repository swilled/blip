// One-shot generator for the pinned extension identity (D-05).
//
// Prints EXTENSION_PUBLIC_KEY (base64 of the SubjectPublicKeyInfo DER, which is exactly the
// manifest `key` value) and EXTENSION_ID (SHA-256 of that DER, first 16 bytes, each nibble mapped
// to the letters a to p). Chrome derives the id from the public key alone; the private key is only
// needed to sign a store package, which is out of scope. The private key is never written or printed.
import { createHash, generateKeyPairSync } from "node:crypto";

const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const der = publicKey.export({ type: "spki", format: "der" });

const hex = createHash("sha256").update(der).digest("hex").slice(0, 32);
const id = [...hex].map((c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16))).join("");

console.log(`EXTENSION_PUBLIC_KEY = ${der.toString("base64")}`);
console.log(`EXTENSION_ID = ${id}`);
