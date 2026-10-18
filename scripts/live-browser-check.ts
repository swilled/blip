import { WebSocket } from "ws";
import { buildFrame, newId, parseFrame, type Message } from "@blip/protocol";

// Exercises the running server and installed extension. Use read-only/navigation commands.
// This temporarily replaces the voice UI connection; reopen Blip when finished.
const socket = new WebSocket("ws://127.0.0.1:7777/ws", { origin: "http://127.0.0.1:7777" });
let latestBusy: boolean | undefined;
socket.on("message", (data) => {
  const parsed = parseFrame(String(data));
  if (parsed.ok && parsed.message.type === "state") latestBusy = parsed.message.payload.busy;
});
function nextFrame(predicate: (message: Message) => boolean, timeoutMs = 25_000): Promise<Message> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", listener); reject(new Error("Live command timed out")); }, timeoutMs);
    function listener(data: unknown): void {
      const parsed = parseFrame(String(data));
      if (!parsed.ok || !predicate(parsed.message)) return;
      clearTimeout(timer);
      socket.off("message", listener);
      resolve(parsed.message);
    }
    socket.on("message", listener);
  });
}
try {
  const welcome = nextFrame((message) => message.type === "welcome");
  socket.on("open", () => socket.send(JSON.stringify(buildFrame("hello", {
    role: "voice", clientVersion: "live-browser-check", protocolVersion: 1,
  }))));
  await welcome;
  if (latestBusy !== false) await nextFrame((message) => message.type === "state" && !message.payload.busy);
  for (const text of process.argv.slice(2)) {
    const reply = nextFrame((message) => message.type === "speak" || message.type === "error");
    socket.send(JSON.stringify(buildFrame("utterance", { utteranceId: newId(), text, source: "typed" })));
    const message = await reply;
    console.log(JSON.stringify({ command: text, type: message.type, payload: message.payload }));
    if (message.type === "error" || (message.type === "speak" && message.payload.category === "error")) {
      throw new Error("A live demo step failed; dependent commands were not run.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
} finally {
  socket.close();
}
