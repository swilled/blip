import type { ConfirmArmedPayload, ConfirmClearedPayload, StatePayload } from "@blip/protocol";

export interface BannerModel {
  visible: boolean;
  phrase: string | null;
  grantId: string | null;
  text: string;
}

export function createBannerModel(): BannerModel {
  return { visible: false, phrase: null, grantId: null, text: "" };
}

function clearBanner(): BannerModel {
  return createBannerModel();
}

export function applyArmed(
  _model: BannerModel,
  payload: Pick<ConfirmArmedPayload, "grantId" | "phrase">,
): BannerModel {
  return {
    visible: true,
    phrase: payload.phrase,
    grantId: payload.grantId,
    text: `Locked · say “${payload.phrase}”`,
  };
}

export function applyCleared(
  model: BannerModel,
  payload: Pick<ConfirmClearedPayload, "grantId">,
): BannerModel {
  return payload.grantId === model.grantId ? clearBanner() : model;
}

export function applyState(model: BannerModel, payload: Pick<StatePayload, "dialogue">): BannerModel {
  return payload.dialogue === "awaiting-confirm" ? model : clearBanner();
}

export function applyClose(_model: BannerModel): BannerModel {
  return clearBanner();
}

export function renderBanner(slot: HTMLElement, model: BannerModel): void {
  slot.replaceChildren();
  if (!model.visible) return;

  const banner = document.createElement("p");
  banner.dataset.blocked = "true";
  banner.setAttribute("aria-label", "Blocked, waiting for confirmation phrase");
  banner.textContent = model.text;
  slot.replaceChildren(banner);
}
