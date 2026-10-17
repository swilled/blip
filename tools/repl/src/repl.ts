// A typed voice client (D-25): connects as role voice, turns each stdin line into an utterance and
// prints one plain-text line per event. It stands in for the voice UI, so it auto-replies speak.done.
//
// Output formats (one line per event):
//   welcome: session=<id> brain=<brain>      state: dialogue=<d> busy=<b> extension=<bool> page=<title|none>
//   transcript: "<text>" via <route>         earcon: <name>
//   speak[<category>]: <text>                confirm.armed: ...   confirm.cleared: ...
//   error: <code> - <message>
// Slash commands: /fixture <name>, /state, /raw <type> <json>, /quit
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { WebSocket } from "ws";
import { buildFrame, buildRawFrame, MAX_UTTERANCE_CHARS, newId, parseFrame, type Message } from "@blip/protocol";

export type ReplControls = {
  /** Switch the fake extension's fixture (only available when the REPL runs in-process with it). */
  setFixture?(name: string): void;
};

export type ReplOptions = {
  /** ws://127.0.0.1:<port>/ws */
  url: string;
  input: Readable;
  output: Writable;
  /** Sent as the Origin header; omitted by default (works against a server started with dev true). */
  origin?: string;
  controls?: ReplControls;
  /** Reply speak.done to every speak (default true), as the voice UI will. */
  autoSpeakDone?: boolean;
};

export type Repl = {
  /** Resolves once the server's welcome arrives; rejects if the connection fails first. */
  ready: Promise<void>;
  send(text: string): void;
  close(): void;
  /** Resolves when the connection has closed (after /quit, close() or the server going away). */
  done: Promise<void>;
};

/** How long, after stdin ends, to wait for outstanding replies before closing anyway. */
const DRAIN_MS = 15000;

export function startRepl(options: ReplOptions): Repl {
  const { output } = options;
  const autoSpeakDone = options.autoSpeakDone ?? true;
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

  let lastStateLine: string | undefined;
  // Turn accounting so a piped stdin that ends right after its last line still sees the reply.
  let utterancesSent = 0;
  let transcriptsSeen = 0;
  let turnsFinished = 0;
  let drainResolve: (() => void) | undefined;
  const checkDrained = (): void => {
    if (turnsFinished >= utterancesSent) drainResolve?.();
  };

  const ready = new Promise<void>((resolve, reject) => {
    let welcomed = false;
    ws.once("error", (err) => {
      if (!welcomed) reject(err);
    });
    ws.once("close", () => {
      if (!welcomed) reject(new Error("closed before welcome"));
      drainResolve?.();
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
          lastStateLine = `state: dialogue=${m.payload.dialogue} busy=${m.payload.busy} extension=${m.payload.extensionConnected} page=${m.payload.page?.title ?? "none"}`;
          print(lastStateLine);
          if (!m.payload.busy && transcriptsSeen > turnsFinished) {
            turnsFinished++;
            checkDrained();
          }
          break;
        case "transcript":
          transcriptsSeen++;
          print(`transcript: "${m.payload.heardAs}" via ${m.payload.routedTo}`);
          break;
        case "earcon":
          print(`earcon: ${m.payload.name}`);
          break;
        case "speak":
          print(`speak[${m.payload.category}]: ${m.payload.text}`);
          if (autoSpeakDone) sendFrame(buildFrame("speak.done", { speakId: m.payload.speakId, interrupted: false }));
          break;
        case "confirm.armed":
          print(`confirm.armed: say "${m.payload.phrase}" to ${m.payload.actionLabel} (${m.payload.kind})`);
          break;
        case "confirm.cleared":
          print(`confirm.cleared: ${m.payload.reason}`);
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
    if (text.length > MAX_UTTERANCE_CHARS) {
      print(`error: too-long - utterances are limited to ${MAX_UTTERANCE_CHARS} characters`);
      return;
    }
    utterancesSent++;
    sendFrame(buildFrame("utterance", { utteranceId: newId(), text, source: "typed" }));
  };

  function command(line: string): void {
    const space = line.indexOf(" ");
    const name = space < 0 ? line : line.slice(0, space);
    const rest = space < 0 ? "" : line.slice(space + 1).trim();
    switch (name) {
      case "/state":
        print(lastStateLine ?? "state: (none received yet)");
        break;
      case "/fixture": {
        if (options.controls?.setFixture === undefined) {
          print("note: fixture switching needs the in-process runner (npm run dev)");
          break;
        }
        try {
          options.controls.setFixture(rest);
          print(`fixture: switched to ${rest}`);
        } catch (err) {
          print(`error: bad-fixture - ${(err as Error).message}`);
        }
        break;
      }
      case "/raw": {
        const split = rest.indexOf(" ");
        const type = split < 0 ? rest : rest.slice(0, split);
        const json = split < 0 ? "{}" : rest.slice(split + 1);
        if (type === "") {
          print("error: usage - /raw <type> <json>");
          break;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(json);
        } catch {
          print("error: bad-json - the payload after the type is not valid JSON");
          break;
        }
        // Deliberately unvalidated: the point is to try frames the server must refuse.
        sendFrame(buildRawFrame(type, payload));
        break;
      }
      case "/quit":
        close();
        break;
      default:
        print(`unknown command: ${name} (try /fixture <name>, /state, /raw <type> <json>, /quit)`);
    }
  }

  // Lines typed before the socket is ready wait for it, in order.
  let chain: Promise<void> = ready.then(
    () => undefined,
    () => undefined,
  );
  const rl = createInterface({ input: options.input });
  rl.on("line", (line) => {
    chain = chain.then(() => {
      const text = line.trim();
      if (text === "") return;
      if (text.startsWith("/")) command(text);
      else sendUtterance(text);
    });
  });
  rl.on("close", () => {
    // stdin ended (a pipe, or Ctrl+D): let in-flight turns finish, then close.
    void chain.then(async () => {
      if (turnsFinished < utterancesSent && ws.readyState === ws.OPEN) {
        await new Promise<void>((resolve) => {
          drainResolve = resolve;
          setTimeout(resolve, DRAIN_MS).unref();
          checkDrained();
        });
      }
      ws.terminate();
    });
  });

  function close(): void {
    rl.removeAllListeners("close");
    rl.close();
    ws.terminate();
  }

  return { ready, send: sendUtterance, close, done };
}
