import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2021",
  platform: "browser",
  outfile: "main.js",
  minify: true,
  logLevel: "info",
});
await mkdir("dist/flowstitch", { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"])
  await copyFile(file, `dist/flowstitch/${file}`);
