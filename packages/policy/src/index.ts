// The protocol remains the source of action kinds; browser-safe classifiers live in the local subpath.
export { ActionKind, GATED_KINDS, isGatedKind } from "@blip/protocol";
export * from "./classify";
