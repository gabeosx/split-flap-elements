import type { SplitFlapEventDetail } from "./types.js";

export function emit(
  target: EventTarget,
  name: string,
  detail: SplitFlapEventDetail = {},
): void {
  target.dispatchEvent(
    new CustomEvent<SplitFlapEventDetail>(name, {
      bubbles: true,
      composed: true,
      detail,
    }),
  );
}
