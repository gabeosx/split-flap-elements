import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const server = spawn(
  "npx",
  ["vite", "demo", "--host", "127.0.0.1", "--port", "4176"],
  { stdio: "ignore" },
);

try {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 640 },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    let randomIndex = 0;
    Math.random = () => ((randomIndex++ % 17) + 0.5) / 18;
  });
  await page.goto("http://127.0.0.1:4176");
  await page.waitForFunction(
    () => document.querySelector("#clock")?.textContent !== "--:--:--",
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: "assets/social-preview.png" });
  await browser.close();
} finally {
  server.kill("SIGTERM");
}
