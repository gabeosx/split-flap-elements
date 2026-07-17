export type ReelPreset = "alpha" | "numeric" | "alphanumeric" | "symbols";

export type IntermediateOrder = "forward" | "reverse" | "random";

export type SettleOrder =
  | "forward"
  | "reverse"
  | "simultaneous"
  | "center-out"
  | "edges-in"
  | readonly (number | readonly number[])[];

export interface CellTiming {
  flipDuration?: number;
  spinDuration?: number;
  intermediateOrder?: IntermediateOrder;
}

export interface SequenceFrame {
  values: Readonly<Record<string, string>>;
  hold?: number;
  timing?: CellTiming | Readonly<Record<string, CellTiming>>;
  settleOrder?: SettleOrder;
  stagger?: number;
}

export interface SpinOptions extends CellTiming {
  signal?: AbortSignal;
}

export interface SplitFlapEventDetail {
  cell?: HTMLElement;
  frame?: number;
  name?: string;
  value?: string;
  previousValue?: string;
  message?: string;
  state?: "idle" | "playing" | "paused" | "stopped";
}
