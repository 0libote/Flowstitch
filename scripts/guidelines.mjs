import { readFile, readdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.id, "flowstitch");
assert.ok(
  manifest.description.length <= 250 && manifest.description.endsWith("."),
);
assert.equal(manifest.isDesktopOnly, false);
assert.equal(manifest.minAppVersion, "1.11.4");
assert.ok((await readFile("LICENSE", "utf8")).includes("MIT License"));
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
  assert.ok(!/sync\/v9|rest\/v2/.test(source), `Obsolete API in ${file}`);
}
const bundle = await readFile("main.js", "utf8");
assert.ok(!/require\(["'](?:fs|path|electron|node:)/.test(bundle));
for (const file of ["main.js", "manifest.json", "styles.css"])
  assert.ok((await stat(`dist/flowstitch/${file}`)).size > 0);
console.log(
  "Automated guideline smoke checks passed (not an official community review).",
);
