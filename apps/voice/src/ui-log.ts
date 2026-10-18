// DOM rendering for the Blip voice window (caption, conversation log, status).
// Replies derive from untrusted page text: only textContent is ever used here.

export type UiStatus = import("./state").VoiceStatus;

const MAX_EXCHANGES = 50;

const STATUS_LABEL: Record<UiStatus, string> = {
  starting: "Starting microphone",
  recovering: "Reconnecting speech recognition",
  finalizing: "Finishing your command",
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  offline: "Not connected",
};

const STATUS_HINT: Record<UiStatus, string> = {
  starting: "Wait for the listening cue, then speak",
  recovering: "Keep holding. Speech recognition is reconnecting.",
  finalizing: "Waiting for the final words",
  idle: "Hold Right Ctrl + Space to talk",
  listening: "Release when you are done",
  thinking: "",
  speaking: "Say stop or hold Right Ctrl + Space to interrupt",
  offline: "Not connected to the Blip server. Retrying.",
};

export interface Exchange {
  you: string;
  blip: string;
  source: "speech" | "typed";
  interrupted?: boolean;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

export function renderCaption(text: string, isFinal: boolean): void {
  const el = byId("caption-text");
  el.textContent = text;
  el.classList.remove("empty");
  el.classList.toggle("interim", !isFinal);
}

export function clearCaption(): void {
  const el = byId("caption-text");
  el.textContent = "Your words appear here.";
  el.classList.remove("interim");
  el.classList.add("empty");
}

function line(tag: string, isBlip: boolean, text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "line";
  const t = document.createElement("span");
  t.className = isBlip ? "tag blip" : "tag";
  t.textContent = tag;
  const body = document.createElement("span");
  body.textContent = text;
  p.append(t, body);
  return p;
}

export function appendExchange(ex: Exchange): void {
  const log = byId("log");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 8;

  const li = document.createElement("li");
  li.append(
    line(ex.source === "typed" ? "You (typed)" : "You", false, ex.you),
    line("Blip", true, ex.interrupted ? `${ex.blip} (interrupted)` : ex.blip),
  );

  log.append(li); // single insertion so a screen reader announces the exchange once
  while (log.children.length > MAX_EXCHANGES) log.firstElementChild?.remove();
  byId("log-empty").hidden = true;

  if (atBottom) log.scrollTop = log.scrollHeight;
}

export function setStatus(state: UiStatus): void {
  const status = byId("status");
  const changed = status.dataset.state !== state;
  status.dataset.state = state;
  const label = byId("status-label");
  label.textContent = STATUS_LABEL[state];
  byId("status-hint").textContent = STATUS_HINT[state];
  byId("connection").textContent = state === "offline" ? "Not connected" : "Connected";
  // Every shape stays in the layout so CSS can crossfade between them; data-on marks the current one.
  for (const svg of status.querySelectorAll<SVGElement>("svg[data-shape]")) {
    svg.toggleAttribute("data-on", svg.dataset.shape === state);
  }
  if (changed) replay(label, "swap");
}

/** Restart a CSS entrance animation on an element that stays in the DOM. */
function replay(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}
