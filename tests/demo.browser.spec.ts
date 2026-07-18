import { expect, test } from "@playwright/test";

test("the departure demo uses varied random starting reel positions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let randomIndex = 0;
    Math.random = () => ((randomIndex++ % 9) + 0.5) / 10;
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...arguments_: any[]
    ) =>
      nativeSetTimeout(
        handler,
        timeout === 450 ? 5_000 : timeout,
        ...arguments_,
      )) as typeof window.setTimeout;
  });
  await page.goto("/");

  const starts: { name: string; value: string; target: string }[] = await page
    .locator("sfe-board")
    .evaluate((element: any) => {
      const firstFrame = element.sequence[0].values;
      return element.cells.map((cell: any) => ({
        name: cell.name,
        value: cell.value,
        target: firstFrame[cell.name],
      }));
    });

  expect(starts).toHaveLength(32);
  expect(new Set(starts.map(({ value }) => value)).size).toBeGreaterThan(1);
  expect(starts.some(({ value, target }) => value !== target)).toBe(true);
});

test("the departure demo loads and plays", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  const board = page.locator("sfe-board");
  await expect(board).toBeVisible();
  await expect(page.locator("sfe-cell")).toHaveCount(32);
  await expect
    .poll(() => board.evaluate((element: any) => element.playbackState))
    .toBe("playing");
  await expect(page.locator("#clock")).not.toHaveText("--:--:--");
  expect(failures).toEqual([]);
});

test("controls expose playback and presentation choices", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page
        .locator("sfe-board")
        .evaluate((element: any) => element.playbackState),
    )
    .toBe("playing");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Light panel" }).click();
  await expect(page.locator("body")).toHaveClass(/light-panel/);
  await page.getByLabel("Settle").selectOption("center-out");
  await expect(page.getByLabel("Settle")).toHaveValue("center-out");
});

test("reduced motion settles without intermediate flips", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const cell = page.locator("sfe-cell").first();
  const flips: number = await cell.evaluate(async (element: any) => {
    let count = 0;
    element.addEventListener("sfe-flip", () => (count += 1));
    const reel = element.reel;
    const target = reel.find((value: string) => value !== element.value);
    await element.spinTo(target, { spinDuration: 1000 });
    return count;
  });
  expect(flips).toBe(0);
});

test("interactive controls have visible keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play sequence" }).focus();
  await expect(
    page.getByRole("button", { name: "Play sequence" }),
  ).toBeFocused();
});
