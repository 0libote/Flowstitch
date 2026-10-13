import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.id, "flowstitch");
assert.ok(
  manifest.description.length <= 250 && manifest.description.endsWith("."),
);
// Desktop-only until the mobile gates in docs/TESTING.md pass; see
// docs/LIMITATIONS.md and docs/RELEASE.md. JSON has no comments, so the
// rationale lives here and in docs rather than in manifest.json.
assert.equal(manifest.isDesktopOnly, true);
assert.equal(manifest.minAppVersion, "1.11.4");
assert.equal(manifest.authorUrl, "https://github.com/0libote/Flowstitch");
assert.ok((await readFile("LICENSE", "utf8")).includes("MIT License"));
// versions.json must map the current version to the manifest minAppVersion;
// drift here breaks the Obsidian update path.
const versions = JSON.parse(await readFile("versions.json", "utf8"));
assert.equal(versions[manifest.version], manifest.minAppVersion);
async function sources(dir) {
  let files = [];
  for (const name of await readdir(dir)) {
    const file = `${dir}/${name}`;
    if ((await stat(file)).isDirectory()) files.push(...(await sources(file)));
    else if (file.endsWith(".ts")) files.push(file);
  }
  return files;
}
for (const file of await sources("src")) {
  const source = await readFile(file, "utf8");
  assert.ok(
    !/\.(innerHTML|outerHTML)|insertAdjacentHTML|console\.(log|debug)|\beval\s*\(|\bnew Function\b|from ["'](?:node:|fs["']|path["']|electron["'])/.test(
      source,
    ),
    `Unsafe runtime pattern in ${file}`,
  );
  assert.ok(
    !/\bdocument\.createElement\s*\(/.test(source),
    `Use Obsidian createEl helpers in ${file}`,
  );
  assert.ok(!/sync\/v9|rest\/v2/.test(source), `Obsolete API in ${file}`);
}
// Command IDs are namespaced by Obsidian with the plugin ID; keep them
// kebab-case without spaces so palette and hotkey surfaces stay stable.
for (const file of await sources("src")) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(/addCommand\(\{\s*id:\s*"([^"]+)"/g)) {
    assert.ok(
      /^[a-z0-9-]+$/.test(match[1]),
      `Command ID "${match[1]}" in ${file} must be kebab-case`,
    );
  }
}
// CSS scoping: every rule must target .flowstitch-* classes so plugin styles
// never leak into host or community-theme surfaces.
const css = await readFile("styles.css", "utf8");
for (const block of css.split("}")) {
  const selector = block.split("{")[0] ?? "";
  for (const part of selector.split(",")) {
    const trimmed = part.trim().replace(/^\/\*.*\*\/\s*/, "");
    if (!trimmed || trimmed.startsWith("@")) continue;
    assert.ok(
      trimmed.startsWith(".flowstitch"),
      `Unscoped CSS selector "${trimmed}"`,
    );
  }
}
// Theme variables: plugin chrome must follow host light/dark themes.
assert.ok(css.includes("var(--"), "styles.css must use theme variables");
// Secrets scan on the packaged output: no private keys, token literals, or
// credential files may ship in dist/.
async function distFiles(dir) {
  let files = [];
  for (const name of await readdir(dir)) {
    const file = `${dir}/${name}`;
    if ((await stat(file)).isDirectory())
      files.push(...(await distFiles(file)));
    else files.push(file);
  }
  return files;
}
for (const file of await distFiles("dist")) {
  if (file.endsWith(".zip") || file.endsWith("SHA256SUMS.json")) continue;
  const content = await readFile(file, "utf8").catch(() => null);
  if (content === null) continue;
  assert.ok(
    !/(ghp_|gho_|sk-live-|BEGIN (?:RSA )?PRIVATE KEY|api[_-]?token\s*[:=]\s*["'][^"']{8,})/i.test(
      content,
    ),
    `Possible secret in ${file}`,
  );
}
const bundle = await readFile("main.js", "utf8");
assert.ok(!/require\(["'](?:fs|path|electron|node:)/.test(bundle));
assert.ok(
  bundle.includes("MIT License"),
  "Bundle banner must retain the MIT notice",
);
for (const file of ["main.js", "manifest.json", "styles.css", "LICENSE"])
  assert.ok((await stat(`dist/flowstitch/${file}`)).size > 0);
console.log(
  "Automated guideline smoke checks passed (not an official community review).",
);
