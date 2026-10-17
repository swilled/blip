// A typed voice client (D-25): connects as role voice, turns each stdin line into an utterance and
// prints one plain-text line per event. It stands in for the voice UI, so it auto-replies speak.done.
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { WebSocket } from "ws";
import { buildFrame, newId, parseFrame, type Message } from "@blip/protocol";

export type ReplOptions = {
  /** ws://127.0.0.1:<port>/ws */
  url: string;
  input: Readable;
  output: Writable;
  /** Sent as the Origin header; omitted by default (works against a server started with dev true). */
  origin?: string;
};

export type Repl = {
  /** Resolves once the server's welcome arrives; rejects if the connection fails first. */
  ready: Promise<void>;
  send(text: string): void;
  close(): void;
  done: Promise<void>;
};

export function startRepl(options: ReplOptions): Repl {
  const { output } = options;
  const print = (line: string): void => {
    output.write(`${line}\n`);
  };

  const ws = new WebSocket(options.url, options.origin !== undefined ? { origin: options.origin } : {});
  const sendFrame = (frame: unknown): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  };

  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const ready = new Promise<void>((resolve, reject) => {
    let welcomed = false;
    ws.once("error", (err) => {
      if (!welcomed) reject(err);
    });
    ws.once("close", () => {
      if (!welcomed) reject(new Error("closed before welcome"));
      resolveDone();
    });
    ws.on("open", () => {
      sendFrame(buildFrame("hello", { role: "voice", clientVersion: "repl", protocolVersion: 1 }));
    });
    ws.on("message", (data) => {
      const parsed = parseFrame(Array.isArray(data) ? Buffer.concat(data) : (data as Buffer));
      if (!parsed.ok) {
        print(`error: ${parsed.code} - ${parsed.message}`);
        return;
      }
      const m: Message = parsed.message;
      switch (m.type) {
        case "welcome":
          print(`welcome: session=${m.payload.sessionId} brain=${m.payload.brain}`);
          if (!welcomed) {
            welcomed = true;
            resolve();
          }
          break;
        case "state":
          print(
            `state: dialogue=${m.payload.dialogue} busy=${m.payload.busy} extension=${m.payload.extensionConnected} page=${m.payload.page?.title ?? "none"}`,
          );
          break;
        case "transcript":
          print(`transcript: "${m.payload.heardAs}" via ${m.payload.routedTo}`);
          break;
        case "earcon":
          print(`earcon: ${m.payload.name}`);
          break;
        case "speak":
          print(`speak[${m.payload.category}]: ${m.payload.text}`);
          sendFrame(buildFrame("speak.done", { speakId: m.payload.speakId, interrupted: false }));
          break;
        case "error":
          print(`error: ${m.payload.code} - ${m.payload.message}`);
          break;
        default:
          break;
      }
    });
  });
  ready.catch(() => {});

  const sendUtterance = (text: string): void => {
    sendFrame(buildFrame("utterance", { utteranceId: newId(), text, source: "typed" }));
  };

  // Lines typed before the socket is ready wait for it, in order.
  let chain: Promise<void> = ready.then(
    () => undefined,
    () => undefined,
  );
  const rl = createInterface({ input: options.input });
  rl.on("line", (line) => {
    chain = chain.then(() => {
      const text = line.trim();
      if (text !== "") sendUtterance(text);
    });
  });

  return {
    ready,
    send: sendUtterance,
    close: () => {
      rl.close();
      ws.terminate();
    },
    done,
  };
}
