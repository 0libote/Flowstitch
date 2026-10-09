# Release procedure

Releases follow the standard Obsidian plugin flow: a version tag triggers
`.github/workflows/release.yml`, which builds `main.js` and creates a draft
GitHub release with `main.js`, `manifest.json` and `styles.css` as individual
assets, plus build-provenance attestation. The tag must match the
`manifest.json` version, and `versions.json` must map that version to its
`minAppVersion`.

1. Complete every real-host/live-account manual gate in TESTING.md using a dedicated Todoist project and backup test vault.
2. Review the naming conflict in RESEARCH.md. `flowstitch` was not in the fetched community-plugin registry, but absence does not reserve it. Confirm contributor identity, public repository URL, trademarks and naming before publication. Rename manifest/package/plugin folder, code-block names, commands, CSS and documented markers together if necessary.
3. Review dependency licences, security audit, API changes, release guidelines and mobile minAppVersion. Pin a lockfile and retain source/attribution.
4. Run `npm ci`, `npm run check`, `npm run format:check`, `npm audit --audit-level=moderate`, `npm run package`. Compare the generated SHA256SUMS.json with intended artifacts.
5. Bump with `npm version <patch|minor|major>` (or `npm version <version>`). The `version` script in `package.json` runs `scripts/version-bump.mjs`, which copies the new `package.json` version into `manifest.json` and adds the version/`minAppVersion` mapping to `versions.json`, staging both files. Record tested platforms and known limitations in CHANGELOG.md.
6. Push with `git push --follow-tags`. The release workflow builds and opens a **draft** GitHub release for the tag. Verify the assets, edit the release notes, then publish the release.
7. Submit a community listing following the current official requirements, including repository, ID/name, description, author and mobile declaration. Do not claim actual iOS/Android support until manual tests establish it. The current manifest declares portable implementation intent, not tested-device certification.

Never bundle API tokens, data.json, vault notes, .env or test credentials. OAuth is not included. A future public OAuth implementation must validate current PKCE/public-client requirements, registered redirects, desktop/mobile URI return handling and token lifecycle without a client secret in distributed code.

## First release

`0.1.0` is the first GitHub release, cut from `main` with tag `0.1.0`. It is a
beta: automated checks pass, but the live Todoist and real Obsidian
desktop/mobile acceptance gates in TESTING.md were still open at release time
(see CHANGELOG.md). It is not yet submitted to the community plugin registry.
