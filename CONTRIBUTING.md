# Contributing

Issues and focused pull requests are welcome.

## Setup

```sh
npm install
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

## Release process

Release Please maintains a release pull request. Merging that pull request creates the matching tag and GitHub Release. npm publishing remains disabled until the package's trusted publisher has been configured.
