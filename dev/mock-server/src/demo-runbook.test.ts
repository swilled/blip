import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync(new URL("../../../.planning/workstreams/voice/phases/04-nvda-mode-and-demo-safe/04-DEMO-RUNBOOK.md", import.meta.url), "utf8");

describe("Phase 4 demo runbook", () => {
  it("covers the user-led live sequence and each locked fallback", () => {
    for (const requirement of ["D-08", "D-09", "D-10", "D-11", "D-12", "D-13", "D-14", "D-15", "D-16"]) {
      expect(runbook).toContain(requirement);
    }

    expect(runbook.toLowerCase()).toContain("negative validation check");
    expect(runbook).toContain("three successful runs consecutively");
    expect(runbook).toContain("exactly one matching `speakId`");
    expect(runbook).toContain("exactly one phone-hotspot attempt");
    expect(runbook).toContain("uninterrupted three-minute walkthrough");
    expect(runbook).toContain("Never overlap agent speech and NVDA");
    expect(runbook).toContain("same command pipeline");
    expect(runbook).toContain("say aloud that the demo is offline");
  });

  it("uses the supplied live target and records every unperformed Phase 4 check as pending", () => {
    expect(runbook).toContain("https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAANAARkYjixUQ1JLWkRTT1lMVVYyTUxSOFRaQ1EySzhNSi4u");
    expect(runbook).toContain("opening a fresh response page or clearing the page");
    expect(runbook).toContain("npm.cmd run reset -w @blip/mock-server");

    expect(runbook).toContain("Local submit observed. No data was sent.");
    expect(runbook).toContain("not Phase 4 DEMO-03 evidence");
    expect(runbook.toLowerCase()).toContain("no phase 4 live-form rehearsal has been performed or claimed");
    expect(runbook).toContain("no Phase 4 page visit");
    expect(runbook).toContain("Three consecutive live runs");
    expect(runbook).toContain("PENDING — no device result inferred");
    expect(runbook).toContain("PENDING — no tag created");
    expect(runbook).toContain("VOX-08 stays human-needed");
    expect(runbook).toContain("DEMO-03 and freeze remain pending");
  });
});
