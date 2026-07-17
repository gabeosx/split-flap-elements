import { expect, test } from "@playwright/test";

test("departure board dark and light panels", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "One stable visual baseline is sufficient.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("sfe-board")).toHaveScreenshot(
    "departure-dark.png",
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    },
  );
  await page.getByRole("button", { name: "Light panel" }).click();
  await expect(page.locator("sfe-board")).toHaveScreenshot(
    "departure-light.png",
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.1,
    },
  );
});
