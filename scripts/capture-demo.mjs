import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { chromium } from "@playwright/test";

const frames = ".demo-frames";
await rm(frames, { recursive: true, force: true });
await mkdir(frames);
const server = spawn(
  "npx",
  ["vite", "demo", "--host", "127.0.0.1", "--port", "4174"],
  { stdio: "ignore" },
);

try {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 760 },
    deviceScaleFactor: 1,
  });
  await page.goto("http://127.0.0.1:4174");
  for (let index = 0; index < 72; index += 1) {
    await page.screenshot({
      path: `${frames}/frame-${String(index).padStart(3, "0")}.png`,
    });
    await page.waitForTimeout(50);
  }
  await browser.close();
} finally {
  server.kill("SIGTERM");
}

const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    "20",
    "-i",
    `${frames}/frame-%03d.png`,
    "-vf",
    "fps=16,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer",
    "-loop",
    "0",
    "assets/demo.gif",
  ],
  { stdio: "inherit" },
);
await new Promise((resolve, reject) =>
  ffmpeg.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
  ),
);
await rm(frames, { recursive: true, force: true });
