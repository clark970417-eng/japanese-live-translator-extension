# Release and rollback guide

Japanese Live Translate uses two release channels:

- **Beta** tags use `beta-vX.Y.Z`. They are public previews and may be unsigned.
- **Stable** tags use `vX.Y.Z`. Stable automation requires configured Apple and Windows signing credentials and stops before publishing when either is missing.

Every published release must pass extension and desktop tests before its files are attached. Each release includes:

- `SHA256SUMS.txt` for download verification.
- `release-manifest.json` with the source commit, build time, workflow, channel, and signing state.
- Generated release notes from the commits since the previous release.

## Roll back

1. Stop translation and quit the desktop app.
2. Open the repository's **Releases** page and select the last version that worked.
3. Download the installer for the current operating system.
4. Compare the file's SHA-256 value with that release's `SHA256SUMS.txt`.
5. Install the older version over the current installation. User settings and downloaded models are retained.
6. In **App Updates**, select **Stable** to stop receiving Beta builds.

If the app cannot open, reinstalling does not delete user data. Uninstallers are configured to retain app data by default.

## Before publishing

1. Update the version and changelog.
2. Run extension tests, desktop type checking, tests, and production build.
3. Publish a Beta first and complete the live-service checklist in `BETA-TESTING.md`.
4. Promote with a stable `vX.Y.Z` tag only after unresolved blocking issues are closed.
5. Verify every expected asset, `SHA256SUMS.txt`, and `release-manifest.json` on the release page.
