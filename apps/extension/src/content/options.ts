import { boundedText } from "./text.js";

export interface OptionMetadata {
  value: string;
  label: string;
  selected: boolean;
}

export const MAX_OPTIONS = 200;
const MAX_OPTION_TEXT = 200;

/** Extract bounded native select options, preserving a selected item outside the cap. */
export function optionsOf(select: HTMLSelectElement): OptionMetadata[] {
  const allOptions = Array.from(select.options);
  let retained = allOptions.slice(0, MAX_OPTIONS);
  const selected = allOptions.find((option) => option.selected);
  if (selected && !retained.includes(selected)) {
    retained = [...allOptions.slice(0, MAX_OPTIONS - 1), selected];
  }

  return retained.map((option) => ({
    value: boundedText(option.value, MAX_OPTION_TEXT, MAX_OPTION_TEXT),
    label: boundedText(option.label || option.textContent || option.value, MAX_OPTION_TEXT, MAX_OPTION_TEXT),
    selected: option.selected,
  }));
}
