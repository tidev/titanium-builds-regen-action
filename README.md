# Titanium SDK Builds Regen Action

This action can be used in GitHub workflows to generate static JSON files
containing Titanium SDK releases, branches, and branch builds.

## Usage

In your project repo, create the file: `.github/workflows/regen-builds.yml`

```yaml
name: Regen Builds
on:
  - pull_request

jobs:
  check-cla:
    runs-on: ubuntu-latest
    name: Regenerate build

    steps:
    - name: Retrieve the builds
      uses: tidev/titanium-builds-regen-action@v1
      with:
        output-dir: 'registry'
        repo-token: ${{ secrets.GITHUB_TOKEN }}
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
