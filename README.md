# Release pull request action

This action is used to create release from commit history with

- Title based on release branch name or latest github release
- Description containing changelog based on commit messages (conventional commits messages)

## What it does

- It creates pull request with title of release branch version
- It generates change log from commits history, which can be shared in slack
- It creates github release
- It posts changelog to slack

## Action input

| Name                                | Description                                                                     | Example                       | Default        | Required |
|-------------------------------------|---------------------------------------------------------------------------------|-------------------------------|----------------|----------|
| `github-token`                      | Github token with repository scope permissions                                  | `${{ secrets.GITHUB_TOKEN }}` | NO DEFAULT     | yes      |
| `changelog-scopes`                  | Scopes, that will be show in changelog                                          | `{"Worker": ["worker"]}`      | NO DEFAULT     | yes      |
| `changelog-method`                  | Source from which to create changelog                                           | `pull_request_description`    | NO DEFAULT     | yes      |
| `slack-token`                       | Slack token with `chat.postMessage` permissions                                 | `${{ secrets.SLACK_TOKEN }}`  | NO DEFAULT     | no       |
| `slack-channel`                     | Slack channel ID                                                                | `XXXXXX`                      | NO DEFAULT     | no       |
| `release-name-method`               | Whether to fetch release name from branch name or bump minor of last release    | `branch`                      | `branch`       | no       |
| `create-release-pull-request`       | Whether to create release pull request                                          | `true`                        | `false`        | no       |
| `create-github-release      `       | Whether to create github release                                                | `true`                        | `false`        | no       |
| `base-branch`                       | Based branch where pull request will be created                                 | `master`                      | `master`       | no       |
| `release-name-prefix`               | Prepend prefix to release name (version)                                        | `v`                           | `v`            | no       |
| `github-changelog-file-destination` | Where to store github changelog on filesystem                                   | `github_changelog.md`         | `changelog.md` | no       |
| `open-ai-token`                     | Experimental feature see section [experimental feature](#experimental-feature). | `token`                       | NO_DEFAULT     | no       |
| `fetch-author-slack-ids`            | Fetch Slack IDs of commit authors in the changelog                              | `true`                        | `false`        | no       |

### Input details

* `changelog-method` can be one of:
  * `pull_request_description` - Changelog will taken from pull request's description (for `pull_request` trigger). Description can be edited manually.
                                 The resulting changelog text is taken from between `<!-- CHANGELOG -->` comments
  * `pull_request_commits`     - Changelog will taken from pull request's commit messages (for `pull_request` trigger)
  * `pull_request_title`       - Changelog will be taken from pull request's title (for `pull_request` trigger)
  * `commits_compare`          - Changelog will taken from comparison of commit messages between 2 branches

* both `slack-token` and `slack-channel` must be set to send message to slack
* `release-name-method` can be on of:
  * `branch` - parse release name from branch name (i.e. `release/v1.2.3` -> `v.1.2.3`)
  * `tag`    - parse release name from latest and bump minor (i.e. `v1.2.3` -> `v.1.3.3`)
* `github-changelog-file-destination` controls the `github-changelog-file-destination` output

## Action output

| Name                                | Description                             | Example                                                                      |
|-------------------------------------|-----------------------------------------|------------------------------------------------------------------------------|
| `github-changelog`                  | Changelog content                       | `some cool feature`                                                          |
| `github-changelog-file-destination` | Changelog file destination              | `./changelog.md`                                                             |
| `github-changelog-authors`          | Changelog commit authors as JSON string | `[{name:"Tobiáš Potoček",email:"tobias.potocek@apify.com",slackId:"U0xyz"}]` |

## Experimental feature

An experimental feature will rewrite the final changelog using GPT-3 davinci language model.
If you want to try, you need to pass the `open-ai-token` action input with your API token from [openai.com](https://beta.openai.com/).

## Example usage

Example bellow opens pull request from head to base branch with changelog in it's description

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
      - name: run release-pr-action
        uses: apify/release-pr-action
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          changelog-scopes: '{"Worker": ["worker"]}'
          create-release-pull-request: true
          changelog-method: commits_compare
```

Example bellow gets pull request description, parses changelog out of it, creates github release and sends changelog to slack

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
      - name: run release-pr-action
        uses: apify/release-pr-action
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          slack-token: ${{ secrets.slackToken }}
          changelog-scopes: '{"Worker": ["worker"]}'
          slack-channel: 'XXXCCCVVVV'
          changelog-method: pull_request_description
          create-github-release: true
```

## Contribution

Developing Github Actions is tricky. You have essentially two options:

1. Use something like [`act`](https://github.com/nektos/act) to run actions and workflows locally.
2. Push changes to GitHub and let it run there.

For the second option, this repo contains a [test workflow](./.github/workflows/test_action.yaml) that will run the
`release-pr-action` on every PR push. As the action will run on your actual PR, `create-release-pull-request` is by
default `false` so that it doesn't override your PR title and description.

Note that you need to **manually build the code and commit the `dist` folder with the built code**.

### Local setup

1. Run `fnm use` (or `nvm`, or any other node manager you use).
2. Run `npm install`.
3. Run `npm run watch`.

### Development workflow

1. Update code in `./src`.
2. Wait for build to finish.
3. Commit all changes including `./dist` folder.
4. Push changes to GitHub.
5. Observe the action results.
6. Repeat.

Feel free to change the [test workflow](./.github/workflows/test_action.yaml) to suit your needs, but before merging
make sure it's configured with some reasonable defaults that will work for the next person making changes.

**Tip:** To avoid constantly switching to GitHub UI, you can use an IDE integration, such
as [GitHub Actions Manager](https://plugins.jetbrains.com/plugin/19347-github-actions-manager) for
WebStorm, or [GitHub Actions](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-github-actions) for
VSCode.

### Submit changes

1. If needed, run `npm run build` and commit and push any remaining changes.
2. Run `npm run test`.
3. Merge the PR.
4. Publish a new version of action using new release (It needs to be done manually).
