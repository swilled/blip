export type HoldOwner = "manual" | "global";
export function createHoldOwner(change: (state: "start" | "end", reason?: string) => void) {
  let owner: HoldOwner | null = null;
  return {
    get: () => owner,
    update(source: HoldOwner, active: boolean, reason?: string) {
      if (active) {
        if (owner !== null) return;
        owner = source; change("start");
      } else if (owner === source) {
        owner = null; change("end", reason);
      }
    },
    cancel(reason?: string) {
      if (owner !== null) { owner = null; change("end", reason); }
    },
  };
}
