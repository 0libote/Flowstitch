# Release procedure

No public release has been created or authorised. The repository has a build/check workflow that uploads private workflow artifacts when run in your repository; it does not publish releases or submit a community listing.

1. Complete every real-host/live-account manual gate in TESTING.md using a dedicated Todoist project and backup test vault.
2. Review the naming conflict in RESEARCH.md. `flowstitch` was not in the fetched community-plugin registry, but absence does not reserve it. Confirm contributor identity, public repository URL, trademarks and naming before publication. Rename manifest/package/plugin folder, code-block names, commands, CSS and documented markers together if necessary.
3. Review dependency licences, security audit, API changes, release guidelines and mobile minAppVersion. Pin a lockfile and retain source/attribution.
4. Run `npm ci`, `npm run check`, `npm run format:check`, `npm audit --audit-level=moderate`, `npm run package`. Compare the generated SHA256SUMS.json with intended artifacts.
5. Bump package.json/manifest.json together and add the version/minAppVersion mapping in versions.json. Record tested platforms and known limitations in CHANGELOG.md.
6. After explicit publication approval, create a public source repository and tag matching the manifest version (for example 0.1.0). Attach main.js, manifest.json and styles.css as individual release assets; ZIP is an installation convenience, not a substitute for those three assets.
7. Submit a community listing following the current official requirements, including repository, ID/name, description, author and mobile declaration. Do not claim actual iOS/Android support until manual tests establish it. The current manifest declares portable implementation intent, not tested-device certification.

Never bundle API tokens, data.json, vault notes, .env or test credentials. OAuth is not included. A future public OAuth implementation must validate current PKCE/public-client requirements, registered redirects, desktop/mobile URI return handling and token lifecycle without a client secret in distributed code.
