import type { GenerateOptions } from "kokoro-js";
export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export type KokoroWorkerRequest =
  | { type: "load"; id: number }
  | { type: "generate"; id: number; text: string; voice: NonNullable<GenerateOptions["voice"]>; speed: number };
export type KokoroWorkerReply =
  | { type: "ready"; id: number }
  | { type: "audio"; id: number; audio: Float32Array; sampling_rate: number }
  | { type: "error"; id: number }
  | { type: "progress"; percent: number };
