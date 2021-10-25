# Release pull request action

This action is used in apify repositories to create release pull request based on release branch.

# What it does

* It creates pull request with title of release branch version
* It generates change log from commits history, which can be shared in apify slack

# Action input

| Name         | Description                                        | Example        | Required |
| -------------| -------------------------------------------------- | ---------------| -------- |
| `repo-token` | Repository Github token                            | `github-token` |      yes |
| `base-branch`| Based branch where pull request will be created    | `master`       |       no |

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

      - name: run gitflow release
        uses: ./.github/actions/gitflow-release
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          base-branch: main
```

# Contribution

1. Update code in `./src`
2. Run `npm i`
3. Run `npm run all`
4. Commit all changes including `./disc` folder with built code.
5. Publish a new version of action using new release (It needs to be done manually)
