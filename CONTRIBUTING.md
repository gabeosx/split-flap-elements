# Contributing

Issues and focused pull requests are welcome.

## Setup

```sh
npm ci
npm run dev
```

Before opening a pull request, run:

```sh
npm run validate
```

## Commit and pull-request titles

The repository uses Conventional Commits and squash merging because release versions and changelog entries are derived from the final commit title.

- `feat: add a settle mode` introduces functionality.
- `fix: preserve a paused hold` corrects behavior.
- `docs: clarify custom reels` changes documentation only.
- Add `!` before the colon or a `BREAKING CHANGE:` footer for an incompatible API change.

Keep changes framework-neutral and preserve the zero-runtime-dependency package contract.

Public APIs should remain useful from plain HTML and JavaScript. Do not add framework adapters or UI-library integrations to this repository. Include tests for runtime behavior and update README defaults whenever an API default changes.

## Release process

Release Please maintains a release pull request. Merging that pull request creates the matching tag and GitHub Release. npm publishing remains disabled until the package's trusted publisher has been configured.

Maintainers should follow [docs/releasing.md](./docs/releasing.md). Never publish a locally rebuilt substitute when a release already contains the verified package tarball.
