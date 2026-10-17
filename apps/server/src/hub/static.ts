// Optional static serving (D-02): the voice UI build and the form fixtures. Built on sirv because
// traversal and MIME handling are security-sensitive (T-01-25). Roots exist only when their
// directories exist, so Phase 1 works with neither present.
import type { IncomingMessage, ServerResponse } from "node:http";
import sirv from "sirv";

export type StaticRoot = {
  /** URL prefix, "/" or like "/fixtures/forms" (no trailing slash). */
  urlPrefix: string;
  /** Absolute directory on disk. */
  dir: string;
};

/**
 * Returns a handler that serves the first matching root (longest prefix wins) and resolves true when
 * it answered the request, false when no root matched or the file was not found (caller answers 404).
 */
export function createStaticHandler(
  roots: readonly StaticRoot[],
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const ordered = [...roots]
    .sort((a, b) => b.urlPrefix.length - a.urlPrefix.length)
    .map((r) => ({
      prefix: r.urlPrefix === "/" ? "" : r.urlPrefix.replace(/\/+$/, ""),
      serve: sirv(r.dir, {
        dev: true, // read from disk each time: fixtures are edited while the server runs
        dotfiles: false,
        setHeaders: (res) => {
          res.setHeader("X-Content-Type-Options", "nosniff");
        },
      }),
    }));

  return async (req, res) => {
    const original = req.url ?? "/";
    const q = original.indexOf("?");
    const rawPath = q === -1 ? original : original.slice(0, q);
    const query = q === -1 ? "" : original.slice(q);

    for (const root of ordered) {
      let rest: string;
      if (root.prefix === "") rest = rawPath;
      else if (rawPath === root.prefix) rest = "/";
      else if (rawPath.startsWith(`${root.prefix}/`)) rest = rawPath.slice(root.prefix.length);
      else continue;

      req.url = `${rest}${query}`;
      try {
        const served = await new Promise<boolean>((resolve) => {
          res.once("close", () => resolve(true));
          root.serve(req, res, () => resolve(false));
        });
        if (served) return true;
      } finally {
        req.url = original;
      }
    }
    return false;
  };
}
