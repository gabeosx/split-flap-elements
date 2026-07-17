import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("site", { recursive: true, force: true });
await mkdir("site", { recursive: true });
await cp("dist", "site/dist", { recursive: true });
await cp("playground", "site/playground", { recursive: true });
await cp("demo/styles.css", "site/styles.css");
const script = (await readFile("demo/demo.js", "utf8")).replaceAll(
  "../dist/",
  "./dist/",
);
await writeFile("site/demo.js", script);
const html = (await readFile("demo/index.html", "utf8")).replaceAll(
  "../dist/",
  "./dist/",
);
await writeFile("site/index.html", html);
await writeFile("site/.nojekyll", "");
