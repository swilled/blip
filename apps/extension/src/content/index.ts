type BlipContentGlobal = typeof globalThis & { __blipContentShellInstalled?: boolean };

const isolatedWorld = globalThis as BlipContentGlobal;
if (isolatedWorld.__blipContentShellInstalled !== true) {
  // Later plans attach the DOM walker and observer here. This marker makes repeated injection inert.
  isolatedWorld.__blipContentShellInstalled = true;
}
