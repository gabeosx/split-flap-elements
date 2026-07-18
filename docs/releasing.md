# Release runbook

This runbook is for maintainers. Release Please owns versions, tags, changelog entries, and GitHub Releases. Do not edit a release version manually or publish from a source directory.

## Before merging a release PR

1. Confirm the implementation changes are on `main` and the non-release pull request is merged.
2. Confirm CI, Pages, and Release workflows are green on `main`.
3. Review the Release Please PR version and changelog. Before 1.0, fixes produce patches and breaking changes/features produce minors under the repository configuration.
4. Confirm `NPM_PUBLISH_ENABLED` is absent or not `true` until trusted publishing is ready.
5. Merge the Release Please PR only as an explicit release decision.

The merge creates the version tag and GitHub Release. The release workflow validates the version/tag/changelog contract, creates the npm tarball, browser-smoke-tests that exact artifact, writes its SHA-256 checksum, and attaches both files to the release.

## One-time first publication

Use Node 22.14 or later and npm 11.5.1 or later.

1. Download the `.tgz` and matching `.sha256` from the GitHub Release—do not run `npm pack` again.
2. In the download directory, verify the artifact:

   ```sh
   shasum -a 256 -c split-flap-elements-0.1.1.tgz.sha256
   npm publish split-flap-elements-0.1.1.tgz --access public --dry-run
   ```

3. Sign in to the intended npm owner account with publishing 2FA enabled, verify the package name is still available, then publish the exact tarball. npm will prompt for the one-time password when required:

   ```sh
   npm login
   npm whoami
   npm publish split-flap-elements-0.1.1.tgz --access public
   ```

4. Verify the registry result and tarball identity:

   ```sh
   npm view split-flap-elements version dist.integrity
   npm install split-flap-elements@0.1.1
   ```

Replace `0.1.1` with the version created by Release Please if it changes.

## Configure subsequent trusted releases

On the npm package settings page, add one GitHub Actions trusted publisher:

- Organization or user: `gabeosx`
- Repository: `split-flap-elements`
- Workflow filename: `release.yml`
- Environment: leave empty unless the workflow is updated to use the same protected environment
- Allowed action: `npm publish`

The workflow already runs on a GitHub-hosted runner, grants `id-token: write`, uses a compatible Node/npm toolchain, and supplies no npm token. npm automatically generates provenance for trusted publishes.

After verifying those exact settings, create the repository variable `NPM_PUBLISH_ENABLED` with value `true`. Do not add `NPM_TOKEN`.

## Later releases

Merge a reviewed Release Please PR. The same workflow attaches and publishes the exact tested tarball only when `NPM_PUBLISH_ENABLED` equals `true`. Confirm the GitHub Release artifacts, npm version, provenance badge, and live documentation after each release.

If publication fails after the GitHub Release exists, do not delete or retag it. Diagnose the failed workflow and republish the already-attached tarball or rerun the failed job after correcting trusted-publisher configuration.
