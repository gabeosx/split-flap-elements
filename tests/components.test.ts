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
  it("supports arbitrary plain-text reels", () => {
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["READY", "BOARDING", "✓"];
    cell.value = "BOARDING";
    expect(cell.value).toBe("BOARDING");
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

  it("emits flip and settle boundaries in order", async () => {
    const cell = new SfeCell();
    document.body.append(cell);
    cell.reel = ["A", "B", "C"];
    cell.value = "A";
    const events: string[] = [];
    cell.addEventListener("sfe-flip-start", () => events.push("start"));
    cell.addEventListener("sfe-flip", () => events.push("flip"));
    cell.addEventListener("sfe-settle", () => events.push("settle"));
    await cell.spinTo("C", { spinDuration: 20, flipDuration: 20 });
    expect(events).toEqual(["start", "flip", "settle"]);
    expect(cell.value).toBe("C");
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

  it("announces only a settled frame when opted in", async () => {
    const board = createBoard();
    board.setAttribute("announce", "");
    board.sequence = [{ values: { first: "B" }, timing: { spinDuration: 0 } }];
    await board.seek(0);
    const live = board.shadowRoot?.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("B");
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
