import { SfeCell } from "./cell.js";
import { emit } from "./events.js";
import type {
  CellTiming,
  SequenceFrame,
  SettleOrder,
  SplitFlapEventDetail,
} from "./types.js";

const boardStyles = String.raw`
  :host {
    --sfe-board-background: #0c0d0e;
    --sfe-board-padding: 0.7rem;
    --sfe-board-gap: 0.12rem;
    --sfe-board-radius: 0.22rem;
    --sfe-board-border: 1px solid rgb(255 255 255 / 0.08);
    display: block;
  }

  .board {
    box-sizing: border-box;
    display: block;
    padding: var(--sfe-board-padding);
    background: var(--sfe-board-background);
    border: var(--sfe-board-border);
    border-radius: var(--sfe-board-radius);
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sfe-board-gap);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
`;

type PlaybackState = "idle" | "playing" | "paused" | "stopped";

function delay(
  ms: number,
  signal: AbortSignal,
  whilePaused: () => Promise<void>,
): Promise<void> {
  return new Promise((resolve) => {
    let remaining = Math.max(0, ms);
    let last = performance.now();

    const tick = async (): Promise<void> => {
      if (signal.aborted) return resolve();
      const now = performance.now();
      remaining -= now - last;
      last = now;
      await whilePaused();
      if (signal.aborted) return resolve();
      last = performance.now();
      if (remaining <= 0) return resolve();
      window.setTimeout(() => void tick(), Math.min(remaining, 50));
    };

    void tick();
  });
}

export class SfeBoard extends HTMLElement {
  static observedAttributes = ["autoplay", "loop", "announce"];

  #sequence: readonly SequenceFrame[] = [];
  #frameIndex = 0;
  #state: PlaybackState = "idle";
  #controller: AbortController | null = null;
  #runId = 0;
  #resumeWaiters = new Set<() => void>();
  #live: HTMLElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${boardStyles}</style><div class="board" part="board"><div class="grid" part="grid"><slot></slot></div><div class="sr-only" aria-live="off" aria-atomic="true"></div></div>`;
    this.#live = root.querySelector(".sr-only")!;
  }

  connectedCallback(): void {
    this.#syncLiveRegion();
    if (this.hasAttribute("autoplay") && this.#sequence.length > 0)
      void this.play();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#syncLiveRegion();
  }

  get sequence(): readonly SequenceFrame[] {
    return this.#sequence;
  }
  set sequence(value: readonly SequenceFrame[]) {
    if (!Array.isArray(value)) {
      this.#configurationError("Sequence must be an array of frames.");
      return;
    }
    this.#sequence = value;
    this.#frameIndex = Math.min(
      this.#frameIndex,
      Math.max(0, value.length - 1),
    );
  }

  get currentFrame(): number {
    return this.#frameIndex;
  }
  get playbackState(): PlaybackState {
    return this.#state;
  }
  get loop(): boolean {
    return this.hasAttribute("loop");
  }
  set loop(value: boolean) {
    this.toggleAttribute("loop", value);
  }

  async play(): Promise<void> {
    if (this.#sequence.length === 0) {
      this.#configurationError(
        "Add at least one frame before starting playback.",
      );
      return;
    }
    if (this.#state === "paused") return this.resume();
    if (this.#state === "playing") return;

    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const runId = ++this.#runId;
    this.#setState("playing");
    emit(this, "sfe-sequence-start", { frame: this.#frameIndex });

    while (!controller.signal.aborted && runId === this.#runId) {
      const frame = this.#sequence[this.#frameIndex];
      if (!frame) break;
      const completed = await this.#showFrame(
        frame,
        this.#frameIndex,
        controller.signal,
      );
      if (!completed || controller.signal.aborted) break;

      await delay(frame.hold ?? 2400, controller.signal, () =>
        this.#whilePaused(controller.signal),
      );
      if (controller.signal.aborted) break;

      if (this.#frameIndex >= this.#sequence.length - 1) {
        if (!this.loop) break;
        this.#frameIndex = 0;
      } else {
        this.#frameIndex += 1;
      }
    }

    if (!controller.signal.aborted && runId === this.#runId) {
      emit(this, "sfe-sequence-end", { frame: this.#frameIndex });
      this.#setState("idle");
    }
  }

  pause(): void {
    if (this.#state === "playing") this.#setState("paused");
  }

  resume(): void {
    if (this.#state !== "paused") return;
    this.#setState("playing");
    for (const resume of this.#resumeWaiters) resume();
    this.#resumeWaiters.clear();
  }

  stop(): void {
    this.#controller?.abort();
    this.#controller = null;
    this.#runId += 1;
    for (const cell of this.cells) cell.cancel();
    for (const resume of this.#resumeWaiters) resume();
    this.#resumeWaiters.clear();
    this.#setState("stopped");
  }

  replay(): Promise<void> {
    this.stop();
    this.#frameIndex = 0;
    return this.play();
  }

  async next(): Promise<void> {
    if (this.#sequence.length === 0) return;
    const next = Math.min(this.#sequence.length - 1, this.#frameIndex + 1);
    await this.seek(next);
  }

  async previous(): Promise<void> {
    if (this.#sequence.length === 0) return;
    const previous = Math.max(0, this.#frameIndex - 1);
    await this.seek(previous);
  }

  async seek(index: number): Promise<void> {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.#sequence.length
    ) {
      this.#configurationError(`Frame ${index} is outside the sequence.`);
      return;
    }
    this.stop();
    this.#frameIndex = index;
    const controller = new AbortController();
    this.#controller = controller;
    await this.#showFrame(this.#sequence[index]!, index, controller.signal);
    if (!controller.signal.aborted) this.#setState("idle");
  }

  get cells(): SfeCell[] {
    return Array.from(this.querySelectorAll("sfe-cell")).filter(
      (cell): cell is SfeCell => cell instanceof SfeCell,
    );
  }

  async #showFrame(
    frame: SequenceFrame,
    index: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    emit(this, "sfe-frame-start", { frame: index });
    const cells = this.cells;
    const groups = this.#groupsFor(
      frame.settleOrder ?? "forward",
      cells.length,
    );
    const stagger = Math.max(0, frame.stagger ?? 90);
    const activeGroups = groups
      .map((group) =>
        group.filter((cellIndex) => {
          const cell = cells[cellIndex];
          return cell && frame.values[cell.name] !== undefined;
        }),
      )
      .filter((group) => group.length > 0);

    let previousDuration = 0;
    const schedule = activeGroups.map((group, groupIndex) => {
      const requestedDuration = Math.max(
        ...group.map((cellIndex) => {
          const cell = cells[cellIndex]!;
          const timing = this.#timingFor(frame.timing, cell.name);
          return Math.max(0, timing.spinDuration ?? cell.spinDuration);
        }),
      );
      const spinDuration =
        groupIndex === 0
          ? requestedDuration
          : Math.max(requestedDuration, previousDuration + stagger);
      previousDuration = spinDuration;
      return { group, spinDuration };
    });

    await this.#whilePaused(signal);
    if (signal.aborted) return false;
    const work = schedule.flatMap(({ group, spinDuration }) =>
      group.map((cellIndex) => {
        const cell = cells[cellIndex]!;
        const target = frame.values[cell.name]!;
        const timing = this.#timingFor(frame.timing, cell.name);
        return cell.spinTo(target, { ...timing, spinDuration, signal });
      }),
    );
    const results = await Promise.all(work);
    if (results.some((result) => !result)) return false;

    if (signal.aborted) return false;
    emit(this, "sfe-frame-settle", { frame: index });
    if (this.hasAttribute("announce")) {
      const announcement = cells
        .map((cell) => cell.value)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      this.#live.textContent = announcement;
    }
    return true;
  }

  #groupsFor(order: SettleOrder, count: number): number[][] {
    const forward = Array.from({ length: count }, (_, index) => index);
    if (Array.isArray(order)) {
      const seen = new Set<number>();
      const groups: number[][] = [];
      for (const item of order) {
        const group = (Array.isArray(item) ? item : [item]).filter(
          (index): index is number =>
            Number.isInteger(index) &&
            index >= 0 &&
            index < count &&
            !seen.has(index),
        );
        for (const index of group) seen.add(index);
        if (group.length > 0) groups.push(group);
      }
      for (const index of forward) if (!seen.has(index)) groups.push([index]);
      return groups;
    }
    if (order === "simultaneous") return [forward];
    if (order === "reverse") return forward.reverse().map((index) => [index]);
    if (order === "center-out") {
      return forward
        .sort(
          (a, b) =>
            Math.abs(a - (count - 1) / 2) - Math.abs(b - (count - 1) / 2),
        )
        .map((index) => [index]);
    }
    if (order === "edges-in") {
      return forward
        .sort((a, b) => Math.min(a, count - 1 - a) - Math.min(b, count - 1 - b))
        .map((index) => [index]);
    }
    return forward.map((index) => [index]);
  }

  #timingFor(timing: SequenceFrame["timing"], name: string): CellTiming {
    if (!timing) return {};
    if (
      "flipDuration" in timing ||
      "spinDuration" in timing ||
      "intermediateOrder" in timing
    )
      return timing as CellTiming;
    return (timing as Readonly<Record<string, CellTiming>>)[name] ?? {};
  }

  #whilePaused(signal: AbortSignal): Promise<void> {
    if (this.#state !== "paused" || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => this.#resumeWaiters.add(resolve));
  }

  #setState(state: PlaybackState): void {
    this.#state = state;
    emit(this, "sfe-playback-state", { state } satisfies SplitFlapEventDetail);
  }

  #syncLiveRegion(): void {
    this.#live.setAttribute(
      "aria-live",
      this.hasAttribute("announce") ? "polite" : "off",
    );
  }

  #configurationError(message: string): void {
    emit(this, "sfe-config-error", { message, frame: this.#frameIndex });
  }
}

if (!customElements.get("sfe-board"))
  customElements.define("sfe-board", SfeBoard);
