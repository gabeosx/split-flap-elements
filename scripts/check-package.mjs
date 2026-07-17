import { execFileSync } from "node:child_process";

const result = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }),
)[0];
const files = result.files.map(({ path }) => path);
const allowedRoots = ["CHANGELOG.md", "LICENSE", "README.md", "package.json"];
const unexpected = files.filter(
  (path) => !path.startsWith("dist/") && !allowedRoots.includes(path),
);

if (unexpected.length > 0) {
  throw new Error(`Unexpected package files:\n${unexpected.join("\n")}`);
}
if (!files.includes("dist/index.js") || !files.includes("dist/index.d.ts")) {
  throw new Error("The package is missing its JavaScript or type entry point.");
}
console.log(
  `Package contract verified: ${files.length} files, ${result.size} bytes.`,
);
