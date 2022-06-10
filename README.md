# Titanium SDK Builds Regen Action

This action can be used in GitHub workflows to generate static JSON files
containing Titanium SDK releases, branches, and branch builds.

## Usage

In your project repo, create the file: `.github/workflows/regen-builds.yml`

```yaml
name: 'Regen Builds'

on:
  workflow_dispatch:
  repository_dispatch:
    types: [ regen-builds ]

jobs:
  regen:
    runs-on: ubuntu-latest

    steps:
      # third-party action that cancels previous runs
      - name: Cancel Previous Runs
        uses: styfle/cancel-workflow-action@0.4.0
        with:
          access_token: ${{ github.token }}

      - name: Checkout titanium-builds
        uses: actions/checkout@v3

      - name: Retrieve the builds
        uses: tidev/titanium-builds-regen-action@v1
        with:
          output-dir: 'public/registry'
          repo-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Commit changes
        id: committed
        uses: stefanzweifel/git-auto-commit-action@v4

      - name: Repository Dispatch
        if: steps.committed.outputs.changes_detected == 'true'
        uses: peter-evans/repository-dispatch@v2
        with:
          event-type: deploy
          token: ${{ secrets.REGEN_BUILDS_DOCS_GITHUB_TOKEN }}

```

## Releasing a new version

To release a new version we need to bump the version and then recreate the `v1`
tag. We use the `v1` tag to avoid having to update the action in all
repositories when a change is made. To do this:

1. Bump the version as required using `npm version major|minor|patch`
2. Recreate the v1 tag using `git tag --force v1`
3. Delete the tag on the remote `git tag :refs/tags/v1`
4. Push the commit and updated tags `git push -f --tags`

## Manual Run

```sh
$ TOKEN=<snip> OUTPUT_DIR=registry node index.js
```
