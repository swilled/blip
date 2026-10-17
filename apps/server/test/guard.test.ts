import { describe, expect, it } from "vitest";
import { EXTENSION_ID, extensionOrigin } from "@blip/protocol";
import { devVoiceOrigins, hostAllowed, parseAllowedOrigin, rolesForOrigin } from "../src/hub/guard";

const PORT = 7777;
const rules = (over: Partial<Parameters<typeof rolesForOrigin>[1]> = {}) => ({
  extId: EXTENSION_ID,
  port: PORT,
  dev: false,
  extraVoice: [] as string[],
  ...over,
});

describe("hostAllowed", () => {
  it.each([
    ["127.0.0.1:7777", false, true],
    ["127.0.0.1:7777", true, true],
    ["127.0.0.1:7778", false, false],
    ["127.0.0.1", false, false],
    ["localhost:7777", false, false],
    ["localhost:7777", true, true],
    ["LOCALHOST:7777", true, true],
    ["localhost:7778", true, false],
    ["evil.example", false, false],
    ["evil.example:7777", true, false],
    ["127.0.0.1:7777.evil.example", false, false],
    ["[::1]:7777", true, false],
    ["", false, false],
  ])("Host %j dev=%s -> %s", (host, dev, expected) => {
    expect(hostAllowed(host, PORT, dev)).toBe(expected);
  });

  it("refuses a missing Host header", () => {
    expect(hostAllowed(undefined, PORT, true)).toBe(false);
  });
});

describe("devVoiceOrigins", () => {
  it("lists the hub's own localhost origin and the default Vite ports", () => {
    expect(devVoiceOrigins(PORT)).toEqual([
      "http://localhost:7777",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
    ]);
  });
});

describe("parseAllowedOrigin", () => {
  it.each(["http://localhost:5173", "http://127.0.0.1:3000", "http://localhost:80"])("accepts %s", (o) => {
    expect(parseAllowedOrigin(o)).toBe(o);
  });

  it.each([
    "https://localhost:5173",
    "http://evil.example",
    "http://evil.example:5173",
    "http://localhost:5173/",
    "http://localhost:5173/app",
    "http://localhost",
    "http://localhost:0",
    "http://localhost:99999",
    "HTTP://localhost:5173",
    "localhost:5173",
    "http://0.0.0.0:5173",
    "http://[::1]:5173",
    "",
  ])("throws for %j", (o) => {
    expect(() => parseAllowedOrigin(o)).toThrow(/invalid allowed origin/);
  });
});

describe("rolesForOrigin", () => {
  it("grants the extension role to exactly the pinned extension origin", () => {
    expect(rolesForOrigin(extensionOrigin(), rules())).toEqual(["extension"]);
  });

  it("grants the voice role to exactly http://127.0.0.1:<port>", () => {
    expect(rolesForOrigin("http://127.0.0.1:7777", rules())).toEqual(["voice"]);
  });

  it.each([
    ["an ordinary web page", "https://evil.example"],
    ["the string null", "null"],
    ["https scheme", "https://127.0.0.1:7777"],
    ["wrong port", "http://127.0.0.1:7778"],
    ["trailing slash", "http://127.0.0.1:7777/"],
    ["uppercase scheme", "HTTP://127.0.0.1:7777"],
    ["localhost alias outside dev", "http://localhost:7777"],
    ["another extension id", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["extension origin with trailing slash", `${extensionOrigin()}/`],
    ["empty string", ""],
  ])("refuses %s", (_name, origin) => {
    expect(rolesForOrigin(origin, rules())).toEqual([]);
  });

  it("refuses a missing Origin unless dev", () => {
    expect(rolesForOrigin(undefined, rules())).toEqual([]);
    expect(rolesForOrigin(undefined, rules({ dev: true }))).toEqual(["extension", "voice"]);
  });

  it("grants dev voice origins only under dev", () => {
    for (const o of devVoiceOrigins(PORT)) {
      expect(rolesForOrigin(o, rules({ dev: true }))).toEqual(["voice"]);
      expect(rolesForOrigin(o, rules({ dev: false }))).toEqual([]);
    }
  });

  it("ignores extra voice origins when not dev and grants them voice only when dev", () => {
    const extra = ["http://localhost:4000"];
    expect(rolesForOrigin("http://localhost:4000", rules({ extraVoice: extra }))).toEqual([]);
    expect(rolesForOrigin("http://localhost:4000", rules({ extraVoice: extra, dev: true }))).toEqual(["voice"]);
  });

  it("never lets an extra origin grant the extension role", () => {
    const evilExt = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(rolesForOrigin(evilExt, rules({ extraVoice: [evilExt], dev: true }))).toEqual(["voice"]);
    expect(rolesForOrigin(evilExt, rules({ extraVoice: [evilExt], dev: true }))).not.toContain("extension");
  });
});
