import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
// es2021 target matches the minAppVersion 1.11.4 Electron baseline: modern
// syntax without relying on runtimes newer than the supported Obsidian host.
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
  banner: { js: "/* Flowstitch - MIT License - see LICENSE */" },
});
await mkdir("dist/flowstitch", { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css", "LICENSE"])
  await copyFile(file, `dist/flowstitch/${file}`);
