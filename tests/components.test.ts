import { beforeEach, describe, expect, it, vi } from "vitest";
import { SfeBoard, SfeCell, reelForPreset } from "../src/index.js";

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});

describe("reel presets", () => {
  it("returns a defensive copy", () => {
    const first = reelForPreset("alpha");
    first.push("custom");
    expect(reelForPreset("alpha")).not.toContain("custom");
  });
});

describe("sfe-cell", () => {
  it("uses traditional motion defaults", () => {
    const cell = new SfeCell();
    expect(cell.flipDuration).toBe(140);
    expect(cell.spinDuration).toBe(1400);
    expect(cell.intermediateOrder).toBe("forward");
  });

  it("starts at a random reel position unless a value is provided", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    const random = new SfeCell();
    random.reel = ["A", "B", "C", "D"];
    document.body.append(random);
    expect(random.value).toBe("D");

    const explicit = new SfeCell();
    explicit.reel = ["A", "B", "C", "D"];
    explicit.value = "B";
    document.body.append(explicit);
    expect(explicit.value).toBe("B");
  });

  it("supports arbitrary plain-text reels", () => {
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["READY", "BOARDING", "✓"];
    cell.value = "BOARDING";
    expect(cell.value).toBe("BOARDING");
  });

  it("rejects malformed programmatic reels and spin options without throwing", async () => {
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["A", "B"];
    cell.value = "A";
    const errors: string[] = [];
    cell.addEventListener("sfe-config-error", (event) =>
      errors.push((event as CustomEvent).detail.message),
    );

    expect(() => {
      cell.reel = null as any;
    }).not.toThrow();
    await expect(cell.spinTo("B", { spinDuration: Number.NaN })).resolves.toBe(
      false,
    );
    await expect(cell.spinTo("B", null as any)).resolves.toBe(false);
    await expect(cell.spinTo("B", { signal: {} as AbortSignal })).resolves.toBe(
      false,
    );

    expect(cell.reel).toEqual(["A", "B"]);
    expect(cell.value).toBe("A");
    expect(errors).toEqual([
      "A cell reel must be an array of strings.",
      "spinDuration must be a non-negative finite number.",
      "Spin options must be an object.",
      "signal must be an AbortSignal.",
    ]);
    await expect(cell.spinTo("B", { spinDuration: 0 })).resolves.toBe(true);
    expect(cell.value).toBe("B");
  });

  it("exposes one accessible value while hiding duplicated visual layers", () => {
    const cell = new SfeCell();
    cell.reel = ["A", "B"];
    cell.value = "A";
    document.body.append(cell);
    expect(cell.getAttribute("role")).toBe("img");
    expect(cell.getAttribute("aria-label")).toBe("A");
    expect(
      cell.shadowRoot
        ?.querySelector('[part="cell"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");

    cell.value = "B";
    expect(cell.getAttribute("aria-label")).toBe("B");
    cell.setAttribute("aria-label", "Gate status");
    cell.value = "A";
    expect(cell.getAttribute("aria-label")).toBe("Gate status");
  });

  it("reports a target that is not in the reel", async () => {
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["A", "B"];
    const errors: string[] = [];
    cell.addEventListener("sfe-config-error", (event) =>
      errors.push((event as CustomEvent).detail.message),
    );
    await expect(cell.spinTo("C")).resolves.toBe(false);
    expect(errors[0]).toContain("not present");
  });

  it("reports an invalid value attribute", () => {
    const cell = new SfeCell();
    cell.reel = ["A", "B"];
    cell.setAttribute("value", "C");
    const errors: string[] = [];
    cell.addEventListener("sfe-config-error", (event) =>
      errors.push((event as CustomEvent).detail.message),
    );
    document.body.append(cell);
    expect(errors[0]).toContain("not present");
    expect(cell.value).not.toBe("C");
  });

  it("reports malformed cell attributes and uses safe defaults", () => {
    const cell = new SfeCell();
    cell.setAttribute("preset", "alpah");
    cell.setAttribute("spin-duration", "fast");
    cell.setAttribute("span", "1.5");
    cell.setAttribute("intermediate-order", "sideways");
    const errors: string[] = [];
    cell.addEventListener("sfe-config-error", (event) =>
      errors.push((event as CustomEvent).detail.message),
    );
    document.body.append(cell);

    expect(errors).toEqual([
      "Unknown reel preset “alpah”.",
      "span must be a positive integer.",
      "spin-duration must be a non-negative finite number.",
      "intermediate-order must be forward, reverse, or random.",
    ]);
    expect(cell.preset).toBe("alpha");
    expect(cell.span).toBe(1);
    expect(cell.spinDuration).toBe(1400);
    expect(cell.intermediateOrder).toBe("forward");
  });

  it("emits flip and settle boundaries in order", async () => {
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["A", "B", "C"];
    cell.value = "A";
    const events: string[] = [];
    let boundary: CustomEvent | undefined;
    cell.addEventListener("sfe-flip-start", (event) => {
      boundary = event as CustomEvent;
      events.push("start");
    });
    cell.addEventListener("sfe-flip", () => events.push("flip"));
    cell.addEventListener("sfe-settle", () => events.push("settle"));
    await cell.spinTo("C", { spinDuration: 20, flipDuration: 20 });
    expect(events).toEqual(["start", "flip", "flip", "settle"]);
    expect(boundary?.bubbles).toBe(true);
    expect(boundary?.composed).toBe(true);
    expect(cell.value).toBe("C");
  });

  it("moves through adjacent reel positions during a traditional spin", async () => {
    const cell = new SfeCell();
    cell.reel = ["A", "B", "C", "D"];
    cell.value = "A";
    document.body.append(cell);
    const values: string[] = [];
    cell.addEventListener("sfe-flip", (event) =>
      values.push((event as CustomEvent).detail.value),
    );
    await cell.spinTo("B", { spinDuration: 140, flipDuration: 20 });

    const reel = cell.reel;
    let previous = "A";
    for (const value of values) {
      expect(reel.indexOf(value)).toBe(
        (reel.indexOf(previous) + 1) % reel.length,
      );
      previous = value;
    }
    expect(values.at(-1)).toBe("B");
  });

  it("preserves adjacent reel order when spinning in reverse", async () => {
    const cell = new SfeCell();
    cell.reel = ["A", "B", "C", "D"];
    cell.value = "A";
    document.body.append(cell);
    const values: string[] = [];
    cell.addEventListener("sfe-flip", (event) =>
      values.push((event as CustomEvent).detail.value),
    );
    await cell.spinTo("D", {
      spinDuration: 140,
      flipDuration: 20,
      intermediateOrder: "reverse",
    });

    const reel = cell.reel;
    let previous = "A";
    for (const value of values) {
      expect(reel.indexOf(value)).toBe(
        (reel.indexOf(previous) - 1 + reel.length) % reel.length,
      );
      previous = value;
    }
    expect(values.at(-1)).toBe("D");
  });

  it("keeps a programmatic reel authoritative over a stale attribute", () => {
    const cell = new SfeCell();
    cell.setAttribute("reel", '["OLD","VALUES"]');
    document.body.append(cell);
    cell.reel = ["A", "B"];
    cell.value = "B";
    cell.setAttribute("span", "2");
    expect(cell.reel).toEqual(["A", "B"]);
    expect(cell.value).toBe("B");
  });

  it("cleans up abort listeners after every completed step", async () => {
    const cell = new SfeCell();
    cell.reel = ["A", "B", "C"];
    cell.value = "A";
    document.body.append(cell);
    const controller = new AbortController();
    const originalAdd = controller.signal.addEventListener.bind(
      controller.signal,
    );
    const originalRemove = controller.signal.removeEventListener.bind(
      controller.signal,
    );
    let added = 0;
    let removed = 0;
    controller.signal.addEventListener = ((
      ...arguments_: Parameters<AbortSignal["addEventListener"]>
    ) => {
      added += 1;
      return originalAdd(...arguments_);
    }) as AbortSignal["addEventListener"];
    controller.signal.removeEventListener = ((
      ...arguments_: Parameters<AbortSignal["removeEventListener"]>
    ) => {
      removed += 1;
      return originalRemove(...arguments_);
    }) as AbortSignal["removeEventListener"];

    await cell.spinTo("C", {
      spinDuration: 40,
      flipDuration: 20,
      signal: controller.signal,
    });
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
  });

  it("settles immediately when reduced motion is requested", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["A", "B"];
    cell.value = "A";
    await cell.spinTo("B", { spinDuration: 5000 });
    expect(cell.value).toBe("B");
  });
});

describe("sfe-board", () => {
  function createBoard(): SfeBoard {
    const board = new SfeBoard();
    for (const name of ["first", "second", "third"]) {
      const cell = new SfeCell();
      cell.name = name;
      cell.reel = ["A", "B"];
      cell.value = "A";
      board.append(cell);
    }
    document.body.append(board);
    return board;
  }

  it("settles cells in reverse order", async () => {
    const board = createBoard();
    board.sequence = [
      {
        values: { first: "B", second: "B", third: "B" },
        settleOrder: "reverse",
        stagger: 0,
        timing: { spinDuration: 0 },
      },
    ];
    const order: string[] = [];
    board.addEventListener("sfe-settle", (event) =>
      order.push((event as CustomEvent).detail.name),
    );
    await board.seek(0);
    expect(order).toEqual(["third", "second", "first"]);
  });

  it("supports custom simultaneous groups and appends omitted cells", async () => {
    const board = createBoard();
    board.sequence = [
      {
        values: { first: "B", second: "B", third: "B" },
        settleOrder: [[1, 2]],
        stagger: 0,
        timing: { spinDuration: 0 },
      },
    ];
    const order: string[] = [];
    board.addEventListener("sfe-settle", (event) =>
      order.push((event as CustomEvent).detail.name),
    );
    await board.seek(0);
    expect(order.slice(0, 2).sort()).toEqual(["second", "third"]);
    expect(order[2]).toBe("first");
  });

  it("starts every cell before the first ordered settle", async () => {
    const board = createBoard();
    board.sequence = [
      {
        values: { first: "B", second: "B", third: "B" },
        settleOrder: "forward",
        stagger: 20,
        timing: { spinDuration: 40, flipDuration: 10 },
      },
    ];
    const events: string[] = [];
    board.addEventListener("sfe-flip-start", (event) =>
      events.push(`start:${(event as CustomEvent).detail.name}`),
    );
    board.addEventListener("sfe-settle", (event) =>
      events.push(`settle:${(event as CustomEvent).detail.name}`),
    );

    await board.seek(0);

    expect(events.slice(0, 3)).toEqual([
      "start:first",
      "start:second",
      "start:third",
    ]);
    expect(events.slice(3)).toEqual([
      "settle:first",
      "settle:second",
      "settle:third",
    ]);
  });

  it("settles symmetric center-out and edges-in groups together", async () => {
    const board = new SfeBoard();
    for (const name of ["first", "second", "middle", "fourth", "fifth"]) {
      const cell = new SfeCell();
      cell.name = name;
      cell.reel = ["A", "B"];
      cell.value = "A";
      board.append(cell);
    }
    document.body.append(board);

    const durations: Record<string, number | undefined> = {};
    for (const cell of board.cells) {
      vi.spyOn(cell, "spinTo").mockImplementation(async (_target, options) => {
        durations[cell.name] = options?.spinDuration;
        return true;
      });
    }
    const values = Object.fromEntries(
      board.cells.map((cell) => [cell.name, "B"]),
    );

    board.sequence = [
      {
        values,
        settleOrder: "center-out",
        stagger: 30,
        timing: { spinDuration: 100 },
      },
    ];
    await board.seek(0);
    expect(durations).toEqual({
      first: 160,
      second: 130,
      middle: 100,
      fourth: 130,
      fifth: 160,
    });

    Object.keys(durations).forEach((name) => delete durations[name]);
    board.sequence = [
      {
        values,
        settleOrder: "edges-in",
        stagger: 30,
        timing: { spinDuration: 100 },
      },
    ];
    await board.seek(0);
    expect(durations).toEqual({
      first: 100,
      second: 130,
      middle: 160,
      fourth: 130,
      fifth: 100,
    });
  });

  it("uses stagger as a minimum gap between stop groups", async () => {
    const board = createBoard();
    const durations: Record<string, number | undefined> = {};
    for (const cell of board.cells) {
      vi.spyOn(cell, "spinTo").mockImplementation(async (_target, options) => {
        durations[cell.name] = options?.spinDuration;
        return true;
      });
    }
    board.sequence = [
      {
        values: { first: "B", second: "B", third: "B" },
        settleOrder: "forward",
        stagger: 30,
        timing: {
          first: { spinDuration: 100 },
          second: { spinDuration: 20 },
          third: { spinDuration: 60 },
        },
      },
    ];

    await board.seek(0);

    expect(durations).toEqual({ first: 100, second: 130, third: 160 });

    Object.keys(durations).forEach((name) => delete durations[name]);
    board.sequence = [
      {
        values: { first: "B", second: "B", third: "B" },
        settleOrder: "simultaneous",
        timing: {
          first: { spinDuration: 100 },
          second: { spinDuration: 20 },
          third: { spinDuration: 60 },
        },
      },
    ];
    await board.seek(0);
    expect(durations).toEqual({ first: 100, second: 100, third: 100 });
  });

  it("moves through frames with seek, next, and previous", async () => {
    const board = createBoard();
    board.sequence = [
      { values: { first: "A" }, timing: { spinDuration: 0 } },
      { values: { first: "B" }, timing: { spinDuration: 0 } },
    ];
    await board.next();
    expect(board.currentFrame).toBe(1);
    expect(board.cells[0]?.value).toBe("B");
    await board.previous();
    expect(board.currentFrame).toBe(0);
  });

  it("emits playback, frame, flip, and settle boundaries in order", async () => {
    const board = createBoard();
    board.sequence = [
      {
        values: { first: "B" },
        hold: 0,
        timing: { spinDuration: 0 },
      },
    ];
    const events: string[] = [];
    let frameBoundary: CustomEvent | undefined;
    board.addEventListener("sfe-playback-state", (event) =>
      events.push(`state:${(event as CustomEvent).detail.state}`),
    );
    board.addEventListener("sfe-sequence-start", () =>
      events.push("sequence:start"),
    );
    board.addEventListener("sfe-frame-start", (event) => {
      frameBoundary = event as CustomEvent;
      events.push("frame:start");
    });
    board.addEventListener("sfe-flip-start", () => events.push("cell:start"));
    board.addEventListener("sfe-settle", () => events.push("cell:settle"));
    board.addEventListener("sfe-frame-settle", () =>
      events.push("frame:settle"),
    );
    board.addEventListener("sfe-sequence-end", () =>
      events.push("sequence:end"),
    );

    await board.play();

    expect(events).toEqual([
      "state:playing",
      "sequence:start",
      "frame:start",
      "cell:start",
      "cell:settle",
      "frame:settle",
      "sequence:end",
      "state:idle",
    ]);
    expect(frameBoundary?.bubbles).toBe(true);
    expect(frameBoundary?.composed).toBe(true);
  });

  it("rejects malformed and unreachable frames without entering playback", async () => {
    const board = createBoard();
    const errors: string[] = [];
    board.addEventListener("sfe-config-error", (event) =>
      errors.push((event as CustomEvent).detail.message),
    );
    board.sequence = [{} as any];
    await expect(board.play()).resolves.toBeUndefined();
    expect(errors).toContain("Frame 0 must provide a values object.");
    expect(board.playbackState).toBe("idle");

    errors.length = 0;
    board.sequence = [{ values: { first: "MISSING" } }];
    await board.play();
    expect(errors[0]).toContain("not present");
    expect(board.playbackState).toBe("idle");
  });

  it("validates frame timing and settle boundaries before playback", async () => {
    const board = createBoard();
    const errors: string[] = [];
    board.addEventListener("sfe-config-error", (event) =>
      errors.push((event as CustomEvent).detail.message),
    );
    board.sequence = [
      {
        values: { first: "B" },
        hold: -1,
        settleOrder: [99],
        timing: { spinDuration: Number.NaN },
      },
    ];
    await board.play();
    expect(errors).toEqual([
      "Frame 0 hold must be a non-negative number.",
      "Frame 0 has an invalid settleOrder.",
      "Frame 0 has invalid timing.",
    ]);
    expect(board.playbackState).toBe("idle");
  });

  it("autoplays when a sequence is assigned after connection", async () => {
    const board = createBoard();
    board.setAttribute("autoplay", "");
    board.sequence = [
      { values: { first: "B" }, hold: 1000, timing: { spinDuration: 0 } },
    ];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(board.playbackState).toBe("playing");
    board.stop();
  });

  it("freezes active cells while paused", async () => {
    const board = createBoard();
    board.sequence = [
      {
        values: { first: "B", second: "B", third: "B" },
        hold: 0,
        timing: { spinDuration: 120, flipDuration: 40 },
      },
    ];
    const playback = board.play();
    await new Promise((resolve) => setTimeout(resolve, 20));
    board.pause();
    const pausedValues = board.cells.map((cell) => cell.value);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(board.playbackState).toBe("paused");
    expect(board.cells.map((cell) => cell.value)).toEqual(pausedValues);
    board.resume();
    await playback;
    expect(board.cells.every((cell) => cell.value === "B")).toBe(true);
  });

  it("announces only a settled frame when opted in", async () => {
    const board = createBoard();
    board.setAttribute("announce", "");
    board.sequence = [{ values: { first: "B" }, timing: { spinDuration: 0 } }];
    await board.seek(0);
    const live = board.shadowRoot?.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe("BAA");
  });

  it("loops until stopped", async () => {
    const board = createBoard();
    board.loop = true;
    board.sequence = [
      { values: { first: "A" }, hold: 0, timing: { spinDuration: 0 } },
      { values: { first: "B" }, hold: 0, timing: { spinDuration: 0 } },
    ];
    let frames = 0;
    board.addEventListener("sfe-frame-start", () => {
      frames += 1;
      if (frames === 3) board.stop();
    });
    await board.play();
    expect(frames).toBe(3);
    expect(board.playbackState).toBe("stopped");
  });
});
