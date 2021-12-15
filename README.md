# Release pull request action

This action is used in apify repositories to create release pull request based on release branch.

# What it does

* It creates pull request with title of release branch version
* It generates change log from commits history, which can be shared in apify slack

# Action input

| Name              | Description                                        | Example                 | Required |
| ------------------| -------------------------------------------------- | ------------------------| -------- |
| `repo-token`      | Repository Github token                            | `github-token`          |      yes |
| `base-branch`     | Based branch where pull request will be created    | `master`                |       no |
| `changelog-scopes`| Scopes, that will be show in changelog             | `{"Worker": ["worker"]}`|       yes |

# Example usage

```yaml
name: Release pull request

on:
  push:
    branches:
      - release/**

jobs:
  open-release-pr:
    runs-on: ubuntu-latest
    steps:
      - name: clone local repository
        uses: actions/checkout@v2
        with:
          fetch-depth: 0
          
      - name: clone release-pr-action
        uses: actions/checkout@v2
        with:
          repository: apify/release-pr-action
          ref: refs/tags/v1.0.0
          path: ./.github/actions/release-pr-action

      - name: run release-pr-action
        uses: ./.github/actions/release-pr-action
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          base-branch: main
          changelog-scopes: "{ Console: ['app', 'console'], Api: ['api'] }"
```

# Contribution

1. Update code in `./src`
2. Run `npm i`
3. Run `npm run all`
4. Commit all changes including `./disc` folder with built code.
5. Publish a new version of action using new release (It needs to be done manually)
