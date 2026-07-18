import { emit } from "./events.js";
import {
  DEFAULT_FLIP_DURATION,
  DEFAULT_SPIN_DURATION,
  planSpin,
} from "./motion.js";
import { reelForPreset } from "./presets.js";
import type { IntermediateOrder, ReelPreset, SpinOptions } from "./types.js";

const cellStyles = String.raw`
  :host {
    display: inline-block;
    font-family: var(--sfe-font-family, ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace);
    font-size: var(--sfe-font-size, 1rem);
    line-height: 1;
    perspective: 8em;
    width: calc(
      var(--sfe-cell-width, 1.9em) * var(--sfe-span, 1) +
      var(--sfe-board-gap, 0.12rem) * (var(--sfe-span, 1) - 1)
    );
    height: var(--sfe-cell-height, 2.5em);
  }

  .cell {
    position: relative;
    width: 100%;
    height: 100%;
    color: var(--sfe-cell-color, #f3f1e8);
    filter: drop-shadow(var(--sfe-cell-shadow, 0 0.14em 0.3em rgb(0 0 0 / 0.38)));
  }

  .half {
    box-sizing: border-box;
    position: absolute;
    left: 0;
    width: 100%;
    height: 50%;
    overflow: hidden;
    background: var(--sfe-cell-background, #17191b);
    border: var(--sfe-cell-border, 1px solid rgb(255 255 255 / 0.08));
    backface-visibility: hidden;
  }

  .top { top: 0; border-radius: var(--sfe-cell-radius, 0.08em) var(--sfe-cell-radius, 0.08em) 0 0; }
  .bottom { bottom: 0; border-radius: 0 0 var(--sfe-cell-radius, 0.08em) var(--sfe-cell-radius, 0.08em); }
  .top .value { top: 0; }
  .bottom .value { bottom: 0; }

  .value {
    box-sizing: border-box;
    position: absolute;
    left: 0;
    display: grid;
    place-items: center;
    width: 100%;
    height: 200%;
    padding-inline: 0.08em;
    font-size: var(--sfe-value-size, 1.35em);
    font-weight: var(--sfe-font-weight, 700);
    letter-spacing: var(--sfe-letter-spacing, -0.04em);
    white-space: nowrap;
  }

  .split {
    position: absolute;
    z-index: 5;
    top: calc(50% - 0.5px);
    left: 0;
    width: 100%;
    height: 1px;
    background: var(--sfe-split-line, rgb(0 0 0 / 0.82));
    pointer-events: none;
  }

  .moving { z-index: 3; transform-origin: center bottom; }
  .moving.bottom { transform-origin: center top; transform: rotateX(90deg); }
  .cell.is-flipping .moving.top { animation: fold var(--sfe-step-duration, 70ms) cubic-bezier(.55, .06, .68, .19) forwards; }
  .cell.is-flipping .moving.bottom { animation: unfold var(--sfe-step-duration, 70ms) cubic-bezier(.22, .61, .36, 1) var(--sfe-step-duration, 70ms) forwards; }
  .cell.is-paused .moving { animation-play-state: paused; }

  @keyframes fold { to { transform: rotateX(-90deg); } }
  @keyframes unfold { to { transform: rotateX(0deg); } }

  @media (prefers-reduced-motion: reduce) {
    .cell.is-flipping .moving { animation: none; }
  }
`;

function asPositiveNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isPreset(value: unknown): value is ReelPreset {
  return (
    value === "alpha" ||
    value === "numeric" ||
    value === "alphanumeric" ||
    value === "symbols"
  );
}

function isOrder(value: unknown): value is IntermediateOrder {
  return value === "forward" || value === "reverse" || value === "random";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export class SfeCell extends HTMLElement {
  static observedAttributes = [
    "value",
    "preset",
    "reel",
    "span",
    "flip-duration",
    "spin-duration",
    "intermediate-order",
  ];

  #reel: string[] = reelForPreset("alpha");
  #customReel = false;
  #value = " ";
  #token = 0;
  #initialized = false;
  #paused = false;
  #lastAutomaticLabel: string | null = null;
  #cell: HTMLElement;
  #top: HTMLElement;
  #bottom: HTMLElement;
  #movingTop: HTMLElement;
  #movingBottom: HTMLElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${cellStyles}</style><div class="cell" part="cell" aria-hidden="true"><div class="half top" part="top"><span class="value"></span></div><div class="half bottom" part="bottom"><span class="value"></span></div><div class="half top moving" part="moving-top"><span class="value"></span></div><div class="half bottom moving" part="moving-bottom"><span class="value"></span></div><span class="split" part="split-line"></span></div>`;
    this.#cell = root.querySelector(".cell")!;
    this.#top = root.querySelector(".top:not(.moving) .value")!;
    this.#bottom = root.querySelector(".bottom:not(.moving) .value")!;
    this.#movingTop = root.querySelector(".moving.top .value")!;
    this.#movingBottom = root.querySelector(".moving.bottom .value")!;
  }

  connectedCallback(): void {
    for (const name of SfeCell.observedAttributes)
      this.#validateAttribute(name);
    this.#syncFromAttributes();
    if (!this.#initialized && !this.hasAttribute("value")) {
      this.#value =
        this.#reel[Math.floor(Math.random() * this.#reel.length)] ??
        this.#reel[0]!;
    }
    this.#initialized = true;
    this.#render(this.#value, this.#value);
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    this.#validateAttribute(name);
    if (name === "reel" || (name === "preset" && !this.hasAttribute("reel"))) {
      this.#customReel = false;
    }
    this.#syncFromAttributes();
    this.#render(this.#value, this.#value);
  }

  get name(): string {
    return this.getAttribute("name") ?? "";
  }
  set name(value: string) {
    this.setAttribute("name", value);
  }

  get value(): string {
    return this.#value;
  }
  set value(value: string) {
    if (!this.#reel.includes(value)) {
      this.#configurationError(
        `Value “${value}” is not present in this cell's reel.`,
      );
      return;
    }
    this.#value = value;
    if (this.getAttribute("value") !== value) this.setAttribute("value", value);
    this.#render(value, value);
  }

  get reel(): string[] {
    return [...this.#reel];
  }
  set reel(value: readonly string[]) {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== "string")
    ) {
      this.#configurationError("A cell reel must be an array of strings.");
      return;
    }
    const normalized = [...new Set(value)];
    if (normalized.length === 0) {
      this.#configurationError("A cell reel must contain at least one value.");
      return;
    }
    this.#customReel = true;
    this.#reel = normalized;
    if (!this.#reel.includes(this.#value)) {
      this.#value =
        this.#initialized && !this.hasAttribute("value")
          ? this.#reel[Math.floor(Math.random() * this.#reel.length)]!
          : this.#reel[0]!;
    }
    this.#render(this.#value, this.#value);
  }

  get preset(): ReelPreset {
    const value = this.getAttribute("preset");
    return isPreset(value) ? value : "alpha";
  }
  set preset(value: ReelPreset) {
    if (!isPreset(value)) {
      this.#configurationError(`Unknown reel preset “${String(value)}”.`);
      return;
    }
    this.#customReel = false;
    this.#reel = reelForPreset(value);
    if (!this.#reel.includes(this.#value)) this.#value = this.#reel[0]!;
    this.setAttribute("preset", value);
  }

  get flipDuration(): number {
    return asPositiveNumber(
      this.getAttribute("flip-duration"),
      DEFAULT_FLIP_DURATION,
    );
  }
  set flipDuration(value: number) {
    this.setAttribute("flip-duration", String(value));
  }
  get spinDuration(): number {
    return asPositiveNumber(
      this.getAttribute("spin-duration"),
      DEFAULT_SPIN_DURATION,
    );
  }
  set spinDuration(value: number) {
    this.setAttribute("spin-duration", String(value));
  }
  get intermediateOrder(): IntermediateOrder {
    const value = this.getAttribute("intermediate-order");
    return isOrder(value) ? value : "forward";
  }
  set intermediateOrder(value: IntermediateOrder) {
    this.setAttribute("intermediate-order", value);
  }
  get span(): number {
    return Math.max(
      1,
      Math.floor(asPositiveNumber(this.getAttribute("span"), 1)),
    );
  }
  set span(value: number) {
    this.setAttribute("span", String(value));
  }

  async spinTo(target: string, options: SpinOptions = {}): Promise<boolean> {
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      this.#configurationError("Spin options must be an object.");
      return false;
    }
    for (const [name, value] of [
      ["spinDuration", options.spinDuration],
      ["flipDuration", options.flipDuration],
    ] as const) {
      if (value !== undefined && !isNonNegativeNumber(value)) {
        this.#configurationError(
          `${name} must be a non-negative finite number.`,
        );
        return false;
      }
    }
    if (
      options.intermediateOrder !== undefined &&
      !isOrder(options.intermediateOrder)
    ) {
      this.#configurationError(
        "intermediateOrder must be forward, reverse, or random.",
      );
      return false;
    }
    const signal = options.signal;
    if (
      signal !== undefined &&
      (typeof signal !== "object" ||
        typeof signal.aborted !== "boolean" ||
        typeof signal.addEventListener !== "function" ||
        typeof signal.removeEventListener !== "function")
    ) {
      this.#configurationError("signal must be an AbortSignal.");
      return false;
    }
    if (typeof target !== "string") {
      this.#configurationError("A spin target must be a string.");
      return false;
    }
    if (!this.#reel.includes(target)) {
      this.#configurationError(
        `Value “${target}” is not present in this cell's reel.`,
      );
      return false;
    }

    const previousValue = this.#value;
    const runToken = ++this.#token;
    const reduced =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false;
    const spinDuration = options.spinDuration ?? this.spinDuration;
    const flipDuration = Math.max(
      16,
      options.flipDuration ?? this.flipDuration,
    );
    const order = options.intermediateOrder ?? this.intermediateOrder;

    emit(this, "sfe-flip-start", {
      cell: this,
      name: this.name,
      value: target,
      previousValue,
    });
    if (reduced || spinDuration === 0) {
      this.#settle(target, previousValue);
      return true;
    }

    const { path, stepDuration } = planSpin(
      this.#reel,
      previousValue,
      target,
      order,
      spinDuration,
      flipDuration,
    );
    this.style.setProperty(
      "--sfe-step-duration",
      `${Math.max(16, stepDuration / 2)}ms`,
    );

    for (const next of path) {
      if (runToken !== this.#token || signal?.aborted) return false;
      await this.#flipStep(next, stepDuration, runToken, signal);
    }

    if (runToken !== this.#token || signal?.aborted) return false;
    this.#settle(target, previousValue);
    return true;
  }

  cancel(): void {
    this.#token += 1;
    this.#paused = false;
    this.#cell.classList.remove("is-flipping", "is-paused");
  }

  pause(): void {
    this.#paused = true;
    this.#cell.classList.add("is-paused");
  }

  resume(): void {
    this.#paused = false;
    this.#cell.classList.remove("is-paused");
  }

  #syncFromAttributes(): void {
    const reelAttribute = this.getAttribute("reel");
    if (reelAttribute && !this.#customReel) {
      try {
        const parsed: unknown = JSON.parse(reelAttribute);
        if (
          !Array.isArray(parsed) ||
          parsed.some((item) => typeof item !== "string") ||
          parsed.length === 0
        ) {
          throw new Error("Expected a non-empty JSON array of strings.");
        }
        this.#reel = [...new Set(parsed)];
      } catch (error) {
        this.#configurationError(
          `Invalid reel attribute. ${(error as Error).message}`,
        );
      }
    } else if (!this.#customReel) {
      const preset = isPreset(this.getAttribute("preset"))
        ? (this.getAttribute("preset") as ReelPreset)
        : "alpha";
      this.#reel = reelForPreset(preset);
    }

    const requested = this.getAttribute("value");
    if (requested !== null) {
      if (this.#reel.includes(requested)) this.#value = requested;
      else
        this.#configurationError(
          `Value “${requested}” is not present in this cell's reel.`,
        );
    } else if (!this.#reel.includes(this.#value)) {
      this.#value = this.#reel[0]!;
    }
    this.style.setProperty("--sfe-span", String(this.span));
    this.style.gridColumn = `span ${this.span}`;
  }

  #validateAttribute(name: string): void {
    const value = this.getAttribute(name);
    if (value === null) return;
    if (name === "preset" && !isPreset(value)) {
      this.#configurationError(`Unknown reel preset “${value}”.`);
      return;
    }
    if (name === "intermediate-order" && !isOrder(value)) {
      this.#configurationError(
        "intermediate-order must be forward, reverse, or random.",
      );
      return;
    }
    if (name === "flip-duration" || name === "spin-duration") {
      const number = Number(value);
      if (!isNonNegativeNumber(number)) {
        this.#configurationError(
          `${name} must be a non-negative finite number.`,
        );
      }
      return;
    }
    if (name === "span") {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1) {
        this.#configurationError("span must be a positive integer.");
      }
    }
  }

  #flipStep(
    next: string,
    duration: number,
    runToken: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const previous = this.#value;
    this.#render(previous, next);
    this.#cell.classList.remove("is-flipping");
    void this.#cell.offsetWidth;
    this.#cell.classList.add("is-flipping");
    emit(this, "sfe-flip", {
      cell: this,
      name: this.name,
      value: next,
      previousValue: previous,
    });

    return new Promise((resolve) => {
      let remaining = duration;
      let last = performance.now();
      let timer = 0;
      let finished = false;
      const finish = (commit: boolean): void => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (commit && runToken === this.#token && !signal?.aborted) {
          this.#value = next;
          this.#render(next, next);
          this.#cell.classList.remove("is-flipping");
        }
        resolve();
      };
      const onAbort = (): void => finish(false);
      const tick = (): void => {
        if (signal?.aborted || runToken !== this.#token) return finish(false);
        const now = performance.now();
        if (!this.#paused) remaining -= now - last;
        last = now;
        if (remaining <= 0) return finish(true);
        timer = window.setTimeout(tick, Math.min(remaining, 16));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      tick();
    });
  }

  #settle(target: string, previousValue: string): void {
    this.#value = target;
    if (this.getAttribute("value") !== target)
      this.setAttribute("value", target);
    this.#render(target, target);
    this.#cell.classList.remove("is-flipping");
    emit(this, "sfe-settle", {
      cell: this,
      name: this.name,
      value: target,
      previousValue,
    });
  }

  #render(current: string, next: string): void {
    this.#top.textContent = current;
    this.#bottom.textContent = current;
    this.#movingTop.textContent = current;
    this.#movingBottom.textContent = next;
    const existingLabel = this.getAttribute("aria-label");
    if (existingLabel === null || existingLabel === this.#lastAutomaticLabel) {
      const label = current.trim() === "" ? "blank" : current;
      this.setAttribute("aria-label", label);
      this.#lastAutomaticLabel = label;
    } else {
      this.#lastAutomaticLabel = null;
    }
    if (!this.hasAttribute("role")) this.setAttribute("role", "img");
  }

  #configurationError(message: string): void {
    emit(this, "sfe-config-error", { cell: this, name: this.name, message });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "sfe-cell": SfeCell;
  }
}

if (!customElements.get("sfe-cell")) customElements.define("sfe-cell", SfeCell);
