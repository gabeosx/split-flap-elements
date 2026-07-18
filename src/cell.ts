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
    width: var(--sfe-cell-width, 1.9em);
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

function isPreset(value: string | null): value is ReelPreset {
  return (
    value === "alpha" ||
    value === "numeric" ||
    value === "alphanumeric" ||
    value === "symbols"
  );
}

function isOrder(value: string | null): value is IntermediateOrder {
  return value === "forward" || value === "reverse" || value === "random";
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
  #cell: HTMLElement;
  #top: HTMLElement;
  #bottom: HTMLElement;
  #movingTop: HTMLElement;
  #movingBottom: HTMLElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${cellStyles}</style><div class="cell" part="cell"><div class="half top" part="top"><span class="value"></span></div><div class="half bottom" part="bottom"><span class="value"></span></div><div class="half top moving" part="moving-top"><span class="value"></span></div><div class="half bottom moving" part="moving-bottom"><span class="value"></span></div><span class="split" part="split-line"></span></div>`;
    this.#cell = root.querySelector(".cell")!;
    this.#top = root.querySelector(".top:not(.moving) .value")!;
    this.#bottom = root.querySelector(".bottom:not(.moving) .value")!;
    this.#movingTop = root.querySelector(".moving.top .value")!;
    this.#movingBottom = root.querySelector(".moving.bottom .value")!;
  }

  connectedCallback(): void {
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
    const normalized = [...new Set(value.map(String))];
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
    return Math.max(1, asPositiveNumber(this.getAttribute("span"), 1));
  }
  set span(value: number) {
    this.setAttribute("span", String(value));
  }

  async spinTo(target: string, options: SpinOptions = {}): Promise<boolean> {
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
      if (runToken !== this.#token || options.signal?.aborted) return false;
      await this.#flipStep(next, stepDuration, runToken, options.signal);
    }

    if (runToken !== this.#token || options.signal?.aborted) return false;
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
