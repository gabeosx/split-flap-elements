import { SfeCell } from "../dist/index.js";

const board = document.querySelector("#departure-board");
const wordReel = ["ON TIME", "BOARDING", "GO TO GATE", "DELAYED", "LAST CALL"];
const destinations = ["OSLO", "TOKYO", "ROME", "LIMA", "CAIRO", "SEOUL"];
const services = ["SF", "BA", "QF", "AZ", "LA", "KE", "✈️", "🚆", "→"];

function addCell(name, options = {}) {
  const cell = new SfeCell();
  cell.name = name;
  cell.preset = options.preset ?? "alphanumeric";
  cell.span = options.span ?? 1;
  if (options.reel) cell.reel = options.reel;
  cell.value = options.value ?? cell.reel[0];
  board.append(cell);
}

for (let row = 0; row < 4; row += 1) {
  for (let index = 0; index < 4; index += 1)
    addCell(`r${row}-time-${index}`, {
      preset: "numeric",
      value: index === 2 ? "3" : "1",
    });
  addCell(`r${row}-service`, { span: 3, reel: services, value: services[row] });
  addCell(`r${row}-destination`, {
    span: 8,
    reel: destinations,
    value: destinations[row],
  });
  addCell(`r${row}-gate`, {
    span: 2,
    reel: ["A1", "B4", "C7", "D2", "E8", "F3"],
    value: ["A1", "B4", "C7", "D2"][row],
  });
  addCell(`r${row}-status`, { span: 5, reel: wordReel, value: wordReel[row] });
  if (row < 3) {
    const divider = document.createElement("span");
    divider.className = "row-break";
    divider.setAttribute("aria-hidden", "true");
    board.append(divider);
  }
}

const schedule = [
  [
    ["13:20", "SF", "OSLO", "A1", "ON TIME"],
    ["13:35", "BA", "TOKYO", "B4", "BOARDING"],
    ["13:50", "QF", "ROME", "C7", "GO TO GATE"],
    ["14:05", "AZ", "LIMA", "D2", "DELAYED"],
  ],
  [
    ["13:25", "✈️", "SEOUL", "F3", "BOARDING"],
    ["13:40", "QF", "CAIRO", "E8", "ON TIME"],
    ["14:00", "LA", "OSLO", "A1", "LAST CALL"],
    ["14:15", "→", "TOKYO", "B4", "ON TIME"],
  ],
  [
    ["13:30", "QF", "ROME", "C7", "GO TO GATE"],
    ["13:45", "AZ", "LIMA", "D2", "DELAYED"],
    ["14:05", "🚆", "SEOUL", "F3", "BOARDING"],
    ["14:20", "BA", "CAIRO", "E8", "ON TIME"],
  ],
];

function makeFrames(order = "forward", spinDuration = 720) {
  return schedule.map((rows) => {
    const values = {};
    rows.forEach(([time, service, destination, gate, status], row) => {
      Array.from(time.replace(":", "")).forEach((value, index) => {
        values[`r${row}-time-${index}`] = value;
      });
      values[`r${row}-service`] = service;
      values[`r${row}-destination`] = destination;
      values[`r${row}-gate`] = gate;
      values[`r${row}-status`] = status;
    });
    return {
      values,
      hold: 1700,
      settleOrder: order,
      stagger: 24,
      timing: { spinDuration, flipDuration: 90 },
    };
  });
}

function updateSequence() {
  board.sequence = makeFrames(
    document.querySelector("#order").value,
    Number(document.querySelector("#tempo").value),
  );
}

updateSequence();
board.loop = true;

document.querySelector("#play").addEventListener("click", () => board.play());
document
  .querySelector("#pause")
  .addEventListener("click", () =>
    board.playbackState === "paused" ? board.resume() : board.pause(),
  );
document
  .querySelector("#previous")
  .addEventListener("click", () => board.previous());
document.querySelector("#next").addEventListener("click", () => board.next());
document.querySelector("#loop").addEventListener("change", (event) => {
  board.loop = event.currentTarget.checked;
});
document.querySelector("#order").addEventListener("change", updateSequence);
document.querySelector("#tempo").addEventListener("input", updateSequence);
document.querySelector("#theme").addEventListener("click", (event) => {
  const active = document.body.classList.toggle("light-panel");
  event.currentTarget.textContent = active ? "Dark panel" : "Light panel";
});

setInterval(() => {
  document.querySelector("#clock").textContent = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}, 250);

board.addEventListener("sfe-playback-state", (event) => {
  document.querySelector("#pause").textContent =
    event.detail.state === "paused" ? "Resume" : "Pause";
});

window.setTimeout(() => board.play(), 450);
