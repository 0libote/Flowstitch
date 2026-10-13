import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
// Compatibility review pinned to eslint-plugin-obsidianmd 0.4.2 rules
// `no-unsupported-api` and `prefer-create-el`, evaluated against the
// installed Obsidian 1.14.4 types with zero findings (see docs/TESTING.md).
// The plugin targets minAppVersion 1.11.4: declarative settings are guarded
// by requireApiVersion("1.13.0") with a legacy display() fallback, and only
// long-stable surfaces (requestUrl, SecretStorage, Vault.process,
// obsidian://daily) are used, so 1.11.4 hosts stay safe.
const PINNED_PLUGIN = "0.4.2";
async function sources(dir) {
  let files = [];
  for (const name of await readdir(dir)) {
    const file = `${dir}/${name}`;
    if ((await stat(file)).isDirectory()) files.push(...(await sources(file)));
    else if (file.endsWith(".ts")) files.push(file);
  }
  return files;
}
let checked = 0;
for (const file of await sources("src")) {
  const source = await readFile(file, "utf8");
  checked++;
  assert.ok(
    !/\bdocument\.createElement\s*\(/.test(source),
    `prefer-create-el: use createEl helpers in ${file}`,
  );
  assert.ok(
    !/registerMarkdownCodeBlockProcessor\s*\(\s*"[^f]/.test(source) ||
      /registerMarkdownCodeBlockProcessor\s*\(\s*"flowstitch"/.test(source),
    `Unexpected code-block processor in ${file}`,
  );
}
const main = await readFile("src/main.ts", "utf8");
assert.ok(
  main.includes('requireApiVersion("1.13.0")'),
  "Declarative settings must stay guarded for pre-1.13 hosts",
);
console.log(
  `Compat smoke checks passed (eslint-plugin-obsidianmd reference ${PINNED_PLUGIN}, ${checked} source files).`,
);
