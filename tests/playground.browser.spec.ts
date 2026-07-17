import { expect, test } from "@playwright/test";

test("the preset gallery runs every built-in and custom example", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/playground/");
  await expect(page.locator(".preset-card")).toHaveCount(6);
  await expect(page.locator('.preset-card[data-preset="alpha"]')).toBeVisible();
  await expect(
    page.locator('.preset-card[data-preset="numeric"]'),
  ).toBeVisible();
  await expect(
    page.locator('.preset-card[data-preset="alphanumeric"]'),
  ).toBeVisible();
  await expect(
    page.locator('.preset-card[data-preset="symbols"]'),
  ).toBeVisible();
  await expect(page.locator(".preset-card sfe-board")).toHaveCount(6);
  expect(failures).toEqual([]);
});

test("the builder updates its preview and generated code", async ({ page }) => {
  await page.goto("/playground/");
  await page.locator("#builder-preset").selectOption("numeric");
  await page.locator("#builder-frames").fill("12\n34");

  await expect(page.locator("#builder-board sfe-cell")).toHaveCount(2);
  await expect(page.locator("#cell-count")).toHaveText("2 cells");
  await expect(page.locator("#generated-code")).toContainText(
    'preset="numeric"',
  );
  await expect(page.locator("#generated-code")).toContainText(
    '"settleOrder": "center-out"',
  );

  await page.locator("#builder-theme").selectOption("signal");
  await expect(page.locator("#preview-panel")).toHaveClass(/theme-signal/);
  await expect
    .poll(() =>
      page
        .locator("#builder-board")
        .evaluate((element: any) => element.playbackState),
    )
    .toBe("playing");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
});

test("custom reels validate values and generate setup code", async ({
  page,
}) => {
  await page.goto("/playground/");
  await page.locator("#builder-preset").selectOption("custom");
  await expect(page.locator("#builder-reel")).toBeVisible();
  await page.locator("#builder-reel").fill("READY|GO|✓");
  await page.locator("#builder-frames").fill("READY\nMISSING");
  await expect(page.locator("#builder-status")).toContainText(
    "not in the custom reel",
  );
  await expect(page.locator("#builder-status")).toHaveClass(/is-error/);

  await page.locator("#builder-frames").fill("READY\nGO\n✓");
  await expect(page.locator("#builder-status")).toContainText("3 live frames");
  await expect(page.locator("#generated-code")).toContainText(
    'const reel = ["READY","GO","✓"]',
  );
});

test("preset samples can seed the builder and code can be copied", async ({
  page,
}) => {
  await page.goto("/playground/");
  await page
    .locator('.preset-card[data-preset="symbols"]')
    .getByRole("button", { name: "Use in builder" })
    .click();
  await expect(page.locator("#builder-preset")).toHaveValue("symbols");
  await expect(page.locator("#generated-code")).toContainText(
    'preset="symbols"',
  );

  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(
    page.getByRole("button", { name: /Copied|Code selected/ }),
  ).toBeVisible();
});

test("the main demo links to the playground", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "Preset gallery + builder" });
  await expect(link).toHaveAttribute("href", "./playground/");
  await link.click();
  await expect(page).toHaveURL(/\/playground\/$/);
  await expect(
    page.getByRole("heading", { name: "Set the reel. Get the code." }),
  ).toBeVisible();
});
