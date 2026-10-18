import type { MoonshineLine } from "./moonshine-stt";

export type MoonshineWorkerRequest =
  | { id: number; type: "load" }
  | { id: number; type: "create-stream"; streamId: string; updateInterval: number }
  | { id: number; type: "start"; streamId: string }
  | { type: "audio"; streamId: string; sampleRate: number; samples: ArrayBuffer }
  | { id: number; type: "stop"; streamId: string }
  | { id: number; type: "close-stream"; streamId: string }
  | { id: number; type: "close" };

export type MoonshineWorkerReply =
  | { id: number; type: "ok" }
  | { id: number; type: "error"; message: string }
  | { type: "progress"; fraction?: number; file: string }
  | { type: "line-text"; streamId: string; line: MoonshineLine }
  | { type: "line-complete"; streamId: string; line: MoonshineLine }
  | { type: "stream-error"; streamId: string; message: string };
