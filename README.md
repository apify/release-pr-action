# Release pull request action

This action is used to create release pull request with:

- title based on release branch name
- description containing changelog based on commit messages (conventional commits messages)

## What it does

- It creates pull request with title of release branch version
- It generates change log from commits history, which can be shared in apify slack

## Action input

| Name                  | Description                                                                    | Example                         | Required |
|-----------------------|--------------------------------------------------------------------------------|---------------------------------|----------|
| `repo-token`          | Repository Github token                                                        | `github-token`                  | yes      |
| `changelog-scopes`    | Scopes, that will be show in changelog                                         | `{"Worker": ["worker"]}`        | yes      |
| `base-branch`         | Based branch where pull request will be created                                | `master`                        | no       |
| `create-pull-request` | Whether to create release pull request                                         | `false`                         | no       |
| `compare-method`      | Fetch commit history, either by diff of head and branch or latest tag and HEAD | `branch`, `tag`, `pull_request` | no       |

## Action output

| Name        | Description        | Example             |
| ----------- | ------------------ | ------------------- |
| `changelog` | Changelog content  | `some cool feature` |

## Experimental feature

An experimental feature will rewrite the final changelog using GPT-3 davinci language model.
If you want to try, you need to pass the `OPEN_AI_TOKEN` environment variable with your API token from [openai.com](https://beta.openai.com/).

## Example usage

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

      - name: run release-pr-action
        uses: apify/release-pr-action
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          base-branch: main
          changelog-scopes: '{ "Console": ["app", "console"], "Api": ["api"] }'
```

## Contribution

1. Run `fnm use` (or `nvm`, or any other node manager you use)
2. Update code in `./src`
3. Run `npm i`
4. Run `npm run all`
5. Commit all changes including `./dist` folder with built code.
6. Publish a new version of action using new release (It needs to be done manually)
