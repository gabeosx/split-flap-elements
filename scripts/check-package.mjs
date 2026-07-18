import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "split-flap-pack-"));
const suppliedTarball = process.argv[2];
let tarball;
let result;

if (suppliedTarball) {
  tarball = resolve(suppliedTarball);
  result = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8",
    }),
  )[0];
} else {
  result = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", temporary], {
      cwd: root,
      encoding: "utf8",
    }),
  )[0];
  tarball = join(temporary, result.filename);
}

const archiveFiles = execFileSync("tar", ["-tf", tarball], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .map((path) => path.replace(/^package\//, ""));
const files = result.files.map(({ path }) => path);
const allowedRoots = [
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "custom-elements.json",
  "package.json",
];
const unexpected = files.filter(
  (path) => !path.startsWith("dist/") && !allowedRoots.includes(path),
);

if (unexpected.length > 0) {
  throw new Error(`Unexpected package files:\n${unexpected.join("\n")}`);
}
if (!files.includes("dist/index.js") || !files.includes("dist/index.d.ts")) {
  throw new Error("The package is missing its JavaScript or type entry point.");
}
if (!files.includes("custom-elements.json")) {
  throw new Error("The package is missing its Custom Elements Manifest.");
}
if (files.some((path) => !archiveFiles.includes(path))) {
  throw new Error("The actual tarball differs from npm's package manifest.");
}
if (archiveFiles.some((path) => !files.includes(path))) {
  throw new Error("The actual tarball contains files outside npm's manifest.");
}

const fixture = join(temporary, "fixture");
await writeFile(
  join(temporary, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefix",
    fixture,
    tarball,
  ],
  { cwd: root, stdio: "pipe" },
);
await writeFile(
  join(fixture, "smoke.ts"),
  `import "split-flap-elements";
import { SfeBoard } from "split-flap-elements/board";
import { SfeCell } from "split-flap-elements/cell";
import { reelForPreset } from "split-flap-elements/presets";
import type { SequenceFrame } from "split-flap-elements";

const board: SfeBoard = document.createElement("sfe-board");
const cell: SfeCell = document.createElement("sfe-cell");
cell.reel = reelForPreset("alpha");
cell.value = "A";
board.append(cell);
const frames: SequenceFrame[] = [{ values: { letter: "B" } }];
board.sequence = frames;
void board.play();
`,
);
await writeFile(
  join(fixture, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["DOM", "ES2022"],
      strict: true,
      noEmit: true,
    },
    include: ["smoke.ts"],
  }),
);
execFileSync(join(root, "node_modules", ".bin", "tsc"), ["-p", fixture], {
  cwd: fixture,
  stdio: "pipe",
});
await writeFile(
  join(fixture, "index.html"),
  `<!doctype html><sfe-board id="board"><sfe-cell name="letter" preset="alpha" value="A"></sfe-cell></sfe-board><script type="module" src="/smoke.js"></script>`,
);
await writeFile(
  join(fixture, "smoke.js"),
  `import "split-flap-elements"; const board = document.querySelector("#board"); let composed = false; document.addEventListener("sfe-frame-settle", () => { composed = true; }); board.sequence = [{ values: { letter: "B" }, timing: { spinDuration: 0 } }]; await board.seek(0); window.packResult = { defined: Boolean(customElements.get("sfe-board")), value: board.cells[0].value, composed };`,
);

const vite = spawn(
  join(root, "node_modules", ".bin", "vite"),
  [fixture, "--host", "127.0.0.1", "--port", "4175", "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await page.goto("http://127.0.0.1:4175", {
        waitUntil: "networkidle",
      });
      if (!response?.ok()) {
        throw new Error(`Fixture server returned ${response?.status()}.`);
      }
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  if (lastError) throw lastError;
  try {
    await page.waitForFunction(() => window.packResult, undefined, {
      timeout: 10_000,
    });
  } catch (error) {
    const viteError = vite.stderr.read()?.toString().trim();
    throw new Error(
      `Packed browser fixture did not initialize. ${[
        ...browserErrors,
        viteError,
      ]
        .filter(Boolean)
        .join(" | ")}`,
      { cause: error },
    );
  }
  const smoke = await page.evaluate(() => window.packResult);
  if (!smoke.defined || smoke.value !== "B" || !smoke.composed) {
    throw new Error(`Packed browser smoke failed: ${JSON.stringify(smoke)}`);
  }
  await browser.close();

  const presets = await readFile(
    join(fixture, "node_modules", "split-flap-elements", "dist", "presets.js"),
    "utf8",
  );
  if (!presets.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ")) {
    throw new Error("Packed preset module is missing expected content.");
  }
  const manifest = JSON.parse(
    await readFile(
      join(
        fixture,
        "node_modules",
        "split-flap-elements",
        "custom-elements.json",
      ),
      "utf8",
    ),
  );
  const tags = manifest.modules
    .flatMap((module) => module.declarations ?? [])
    .map((declaration) => declaration.tagName)
    .filter(Boolean)
    .sort();
  if (JSON.stringify(tags) !== JSON.stringify(["sfe-board", "sfe-cell"])) {
    throw new Error("Packed Custom Elements Manifest has unexpected tags.");
  }
  console.log(
    `Packed artifact verified in a clean browser fixture: ${files.length} files, ${result.size} bytes.`,
  );
} finally {
  vite.kill("SIGTERM");
  await rm(temporary, { recursive: true, force: true });
}
