import { readFileSync, writeFileSync } from "node:fs";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
  throw new Error("npm_package_version is not set. Run via `npm version`.");
}

// Read minAppVersion from manifest.json and bump version to target version.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// Update versions.json with target version and minAppVersion from manifest.json,
// but only if the target version is not already present.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (!(targetVersion in versions)) {
  versions[targetVersion] = minAppVersion;
  writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");
}
