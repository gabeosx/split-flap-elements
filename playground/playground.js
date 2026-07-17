import { REEL_PRESETS, SfeBoard, SfeCell } from "../dist/index.js";

const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

const PRESET_SAMPLES = [
  {
    id: "alpha",
    label: "Alpha",
    kind: "Built-in preset",
    detail: "Space + A–Z",
    frames: ["FLAP", "OPEN", "TYPE"],
  },
  {
    id: "numeric",
    label: "Numeric",
    kind: "Built-in preset",
    detail: "Space + 0–9",
    frames: ["1234", "2048", "2026"],
  },
  {
    id: "alphanumeric",
    label: "Alphanumeric",
    kind: "Built-in preset",
    detail: "Space + A–Z + 0–9",
    frames: ["GATE7", "A12B3", "READY"],
  },
  {
    id: "symbols",
    label: "Symbols",
    kind: "Built-in preset",
    detail: "17 punctuation + arrows",
    frames: ["←↑→↓", "!!??", "#&@+"],
  },
  {
    id: "custom-words",
    label: "Words",
    kind: "Custom reel",
    detail: "Any plain-text token",
    reel: ["ON TIME", "BOARDING", "LAST CALL"],
    frames: ["ON TIME", "BOARDING", "LAST CALL"],
  },
  {
    id: "custom-emoji",
    label: "Emoji",
    kind: "Custom reel",
    detail: "Unicode graphemes stay intact",
    reel: ["🛫", "🚆", "🚌", "🚲"],
    frames: ["🛫", "🚆", "🚌", "🚲"],
  },
];

const BUILDER_DEFAULTS = {
  alpha: "FLAP\nOPEN\nTYPE",
  numeric: "1234\n2048\n2026",
  alphanumeric: "GATE7\nA12B3\nREADY",
  symbols: "←↑→↓\n!!??\n#&@+",
  custom: "READY\nBOARDING\nLAST CALL",
};

const form = document.querySelector("#builder-form");
const board = document.querySelector("#builder-board");
const presetInput = document.querySelector("#builder-preset");
const reelInput = document.querySelector("#builder-reel");
const framesInput = document.querySelector("#builder-frames");
const orderInput = document.querySelector("#builder-order");
const spinInput = document.querySelector("#builder-spin");
const holdInput = document.querySelector("#builder-hold");
const staggerInput = document.querySelector("#builder-stagger");
const loopInput = document.querySelector("#builder-loop");
const themeInput = document.querySelector("#builder-theme");
const status = document.querySelector("#builder-status");
const generatedCode = document.querySelector("#generated-code");
const previewPanel = document.querySelector("#preview-panel");
let builderPlayTimer;
let activeBuilderConfiguration = null;

function splitGraphemes(value) {
  if (!segmenter) return Array.from(value);
  return Array.from(segmenter.segment(value), ({ segment }) => segment);
}

function valuesFromDelimited(value) {
  return value
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizedFrames(preset, source) {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (preset === "custom") return lines.map(valuesFromDelimited);
  return lines.map((line) =>
    splitGraphemes(
      preset === "alpha" || preset === "alphanumeric"
        ? line.toUpperCase()
        : line,
    ),
  );
}

function createCell(name, { preset, reel, value, span = 1 }) {
  const cell = new SfeCell();
  cell.name = name;
  cell.span = span;
  if (reel) cell.reel = reel;
  else cell.preset = preset;
  cell.value = value;
  return cell;
}

function framesForBoard(frames, cellCount, fill, controls) {
  return frames.map((frame) => {
    const values = {};
    for (let index = 0; index < cellCount; index += 1) {
      values[`cell-${index}`] = frame[index] ?? fill;
    }
    return {
      values,
      hold: controls.hold,
      settleOrder: controls.order,
      stagger: controls.stagger,
      timing: { spinDuration: controls.spin, flipDuration: 90 },
    };
  });
}

function setupSample(sample) {
  const article = document.createElement("article");
  article.className = "preset-card";
  article.dataset.preset = sample.id;
  article.innerHTML = `
    <div class="preset-meta">
      <p>${sample.kind}</p>
      <span>${sample.detail}</span>
    </div>
    <h3>${sample.label}</h3>
    <div class="sample-stage"></div>
    <div class="preset-actions">
      <button type="button" class="sample-replay">Replay</button>
      <button type="button" class="sample-build">Use in builder</button>
    </div>`;

  const sampleBoard = new SfeBoard();
  sampleBoard.setAttribute("aria-label", `${sample.label} reel sample`);
  sampleBoard.loop = true;
  const isCustom = Boolean(sample.reel);
  const tokenFrames = isCustom
    ? sample.frames.map((value) => [value])
    : sample.frames.map(splitGraphemes);
  const cellCount = Math.max(...tokenFrames.map((frame) => frame.length));
  const fill = isCustom ? sample.reel[0] : " ";
  for (let index = 0; index < cellCount; index += 1) {
    const target = tokenFrames[0][index] ?? fill;
    const restingValue = isCustom
      ? (sample.reel.find((value) => value !== target) ?? target)
      : " ";
    sampleBoard.append(
      createCell(`cell-${index}`, {
        preset: isCustom ? undefined : sample.id,
        reel: sample.reel,
        value: restingValue,
        span: isCustom ? (sample.id === "custom-words" ? 5 : 2) : 1,
      }),
    );
  }
  sampleBoard.sequence = framesForBoard(tokenFrames, cellCount, fill, {
    hold: 1400,
    order: "center-out",
    stagger: 35,
    spin: 480,
  });
  article.querySelector(".sample-stage").append(sampleBoard);
  article
    .querySelector(".sample-replay")
    .addEventListener("click", () => sampleBoard.replay());
  article.querySelector(".sample-build").addEventListener("click", () => {
    const preset = isCustom ? "custom" : sample.id;
    presetInput.value = preset;
    framesInput.value = isCustom
      ? sample.frames.join("\n")
      : sample.frames.join("\n");
    if (isCustom) reelInput.value = sample.reel.join("|");
    syncPresetFields();
    renderBuilder();
    document.querySelector("#builder").scrollIntoView({ behavior: "smooth" });
  });
  document.querySelector("#preset-grid").append(article);
  window.setTimeout(() => sampleBoard.play(), 150);
}

for (const sample of PRESET_SAMPLES) setupSample(sample);

function controlsFromForm() {
  return {
    order: orderInput.value,
    spin: Number(spinInput.value),
    hold: Number(holdInput.value),
    stagger: Number(staggerInput.value),
  };
}

function builderConfiguration() {
  const preset = presetInput.value;
  const frames = normalizedFrames(preset, framesInput.value);
  const reel =
    preset === "custom" ? valuesFromDelimited(reelInput.value) : null;
  if (frames.length === 0) throw new Error("Add at least one non-empty frame.");
  if (reel && reel.length === 0)
    throw new Error("Add at least one custom reel token.");
  if (frames.some((frame) => frame.length === 0))
    throw new Error("Each frame needs at least one value.");
  const cellCount = Math.max(...frames.map((frame) => frame.length));
  const fill = reel ? reel[0] : " ";
  const allowed = new Set(reel ?? REEL_PRESETS[preset]);
  const invalid = [
    ...new Set(frames.flat().filter((value) => !allowed.has(value))),
  ];
  if (invalid.length > 0) {
    throw new Error(
      `${invalid.map((value) => `“${value}”`).join(", ")} ${invalid.length === 1 ? "is" : "are"} not in the ${preset} reel.`,
    );
  }
  return { preset, reel, frames, cellCount, fill };
}

function codeFor(configuration, sequence) {
  const loop = loopInput.checked ? " loop" : "";
  const cells = Array.from({ length: configuration.cellCount }, (_, index) => {
    const preset = configuration.reel
      ? ""
      : ` preset="${configuration.preset}"`;
    return `  <sfe-cell name="cell-${index}"${preset}></sfe-cell>`;
  }).join("\n");
  const customSetup = configuration.reel
    ? `\nconst reel = ${JSON.stringify(configuration.reel)};\nfor (const cell of board.querySelectorAll("sfe-cell")) cell.reel = reel;\n`
    : "\n";
  const printableSequence = sequence.map((frame) => ({
    values: frame.values,
    hold: frame.hold,
    settleOrder: frame.settleOrder,
    stagger: frame.stagger,
    timing: frame.timing,
  }));
  return `<sfe-board id="board"${loop}>\n${cells}\n</sfe-board>\n\n<script type="module">\n  import "split-flap-elements";\n\n  const board = document.querySelector("#board");${customSetup}\n  board.sequence = ${JSON.stringify(printableSequence, null, 2)};\n  board.play();\n</script>`;
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function restingValueFor(configuration, index) {
  if (!configuration.reel) return " ";
  const target = configuration.frames[0][index] ?? configuration.fill;
  return (
    configuration.reel.find((value) => value !== target) ?? configuration.fill
  );
}

function replayBuilder() {
  if (!activeBuilderConfiguration) return;
  window.clearTimeout(builderPlayTimer);
  board.stop();
  board.cells.forEach((cell, index) => {
    cell.value = restingValueFor(activeBuilderConfiguration, index);
  });
  void board.replay();
}

function renderBuilder() {
  window.clearTimeout(builderPlayTimer);
  board.stop();
  board.replaceChildren();
  try {
    const configuration = builderConfiguration();
    activeBuilderConfiguration = configuration;
    const controls = controlsFromForm();
    for (let index = 0; index < configuration.cellCount; index += 1) {
      board.append(
        createCell(`cell-${index}`, {
          preset: configuration.reel ? undefined : configuration.preset,
          reel: configuration.reel,
          value: restingValueFor(configuration, index),
        }),
      );
    }
    const sequence = framesForBoard(
      configuration.frames,
      configuration.cellCount,
      configuration.fill,
      controls,
    );
    board.sequence = sequence;
    board.loop = loopInput.checked;
    generatedCode.textContent = codeFor(configuration, sequence);
    document.querySelector("#cell-count").textContent =
      `${configuration.cellCount} ${configuration.cellCount === 1 ? "cell" : "cells"}`;
    const frameLabel =
      configuration.frames.length === 1
        ? "1 live frame. Replay resets and spins it again."
        : `${configuration.frames.length} live frames. Code is ready.`;
    showStatus(frameLabel);
    builderPlayTimer = window.setTimeout(() => board.play(), 80);
  } catch (error) {
    activeBuilderConfiguration = null;
    generatedCode.textContent =
      "// Fix the configuration above to generate code.";
    document.querySelector("#cell-count").textContent = "Invalid configuration";
    showStatus(error.message, true);
  }
}

function syncPresetFields() {
  const isCustom = presetInput.value === "custom";
  document.querySelector(".custom-reel-field").hidden = !isCustom;
  document.querySelector("#frames-help").textContent = isCustom
    ? "One frame per line; use | between cells"
    : "One animation frame per line";
}

function updateOutputs() {
  document.querySelector("#spin-output").textContent = `${spinInput.value} ms`;
  document.querySelector("#hold-output").textContent = `${holdInput.value} ms`;
  document.querySelector("#stagger-output").textContent =
    `${staggerInput.value} ms`;
}

presetInput.addEventListener("change", () => {
  framesInput.value = BUILDER_DEFAULTS[presetInput.value];
  syncPresetFields();
  renderBuilder();
});
form.addEventListener("input", () => {
  updateOutputs();
  renderBuilder();
});
themeInput.addEventListener("change", () => {
  previewPanel.className = `preview-panel theme-${themeInput.value}`;
});

document
  .querySelector("#preview-replay")
  .addEventListener("click", replayBuilder);
document.querySelector("#preview-pause").addEventListener("click", (event) => {
  if (board.playbackState === "paused") board.resume();
  else board.pause();
  event.currentTarget.textContent =
    board.playbackState === "paused" ? "Resume" : "Pause";
});
document
  .querySelector("#preview-previous")
  .addEventListener("click", () => board.previous());
document
  .querySelector("#preview-next")
  .addEventListener("click", () => board.next());

document
  .querySelector("#copy-code")
  .addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(generatedCode.textContent);
      button.textContent = "Copied";
      showStatus("Code copied to the clipboard.");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(generatedCode);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Code selected";
      showStatus("Code selected. Copy it with your keyboard.");
    }
    window.setTimeout(() => (button.textContent = "Copy code"), 1800);
  });

board.addEventListener("sfe-config-error", (event) => {
  showStatus(event.detail.message, true);
});
board.addEventListener("sfe-playback-state", (event) => {
  if (event.detail.state !== "paused")
    document.querySelector("#preview-pause").textContent = "Pause";
});

syncPresetFields();
updateOutputs();
renderBuilder();
