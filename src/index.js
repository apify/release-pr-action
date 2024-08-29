const fs = require('fs/promises');

const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');

const {
    createOrUpdatePullRequest,
    getChangelogFromPullRequestDescription,
    getChangelogFromPullRequestCommits,
    getChangelogFromPullRequestTitle,
    getChangelogFromCompareBranches,
    getReleaseNameInfo,
    createGithubReleaseFn,
    sendReleaseNotesToSlack,
} = require('./utils');

/**
 * Exit if release already exists
 * @param {boolean} alreadyExists - indicates whether release already exists
 * @param {string} releaseName    - release name
 */
function alreadyExistsExit(alreadyExists, releaseName) {
    if (alreadyExists) {
        core.info(`Release ${releaseName} already exists. Exiting..`);
        process.exit(0);
    }
}

/**
 * Create changelog according to selected method
 * @param {*} method          - will determine the way of changelog generation
 * @param {*} octokit         - authorized instance of github.rest client
 * @param {*} scopes          - convectional commits scopes to group changelog items
 * @param {*} context         - github action context
 * @param {string} baseBranch - base branch/commit to start comparison from
 * @param {string} headBranch - head branch/commit to start comparison from
 * @returns {Promise<{ changelog: string, authors: array<{ name: string, email: string }> }>}
 */
async function createChangelog(
    method,
    octokit,
    scopes,
    context,
    baseBranch,
    headBranch,
) {
    let changelog;
    let authors = [];

    switch (method) {
        case 'pull_request_description':
            changelog = await getChangelogFromPullRequestDescription(octokit, context);
            break;
        case 'pull_request_commits':
            changelog = await getChangelogFromPullRequestCommits(octokit, scopes, context);
            break;
        case 'pull_request_title':
            changelog = await getChangelogFromPullRequestTitle(octokit, scopes, context);
            break;
        case 'commits_compare':
            ({ changelog, authors } = await getChangelogFromCompareBranches(octokit, context, baseBranch, headBranch, scopes));
            break;
        default:
            core.error(`Unrecognized "changelog-method" input: ${method}`);
            break;
    }
    return { changelog, authors };
}

/**
 * Execute main logic
 */
async function run() {
    const githubToken = core.getInput('github-token');
    const slackToken = core.getInput('slack-token');
    const changelogScopes = core.getInput('changelog-scopes');
    const changelogMethod = core.getInput('changelog-method');
    const releaseNameMethod = core.getInput('release-name-method');
    const baseBranch = core.getInput('base-branch');
    const releaseNamePrefix = core.getInput('release-name-prefix');
    const createReleasePullRequest = core.getBooleanInput('create-release-pull-request');
    const createGithubRelease = core.getBooleanInput('create-github-release');
    const slackChannel = core.getInput('slack-channel');
    const githubChangelogFileDestination = core.getInput('github-changelog-file-destination');

    const octokit = github.getOctokit(githubToken);
    const context = {
        ...github.context,
        headRef: process.env.GITHUB_HEAD_REF,
        refName: process.env.GITHUB_REF_NAME,
        repository: process.env.GITHUB_REPOSITORY,
        // github.context.repo is getter
        repo: github.context.repo,
    };

    const {
        releaseName,
        headBranch,
        alreadyExists,
    } = await getReleaseNameInfo(
        octokit,
        context,
        releaseNamePrefix,
        releaseNameMethod,
    );

    alreadyExistsExit(alreadyExists, releaseName);

    let scopes;
    try {
        scopes = JSON.parse(changelogScopes);
    } catch (err) {
        throw new Error('The changelog-scopes input cannot be parsed as JSON.');
    }

    const { changelog, authors } = await createChangelog(
        changelogMethod,
        octokit,
        scopes,
        context,
        baseBranch,
        headBranch,
    );

    core.info(`Changelog:\n${changelog}`);
    core.info(`Authors:\n${authors.map((author) => `${author.name} <${author.email}>`).join('\n')}`);

    // core.info(`Trying to fetch Slack users`);
    // const slack = new WebClient(slackToken);
    // const { members } = await slack.users.list({});
    // core.info(`Slack users: ${members.map((member) => member.profile?.email).join(', ')}`);

    if (createReleasePullRequest) {
        core.info('Opening the release pull request');
        await createOrUpdatePullRequest(octokit, {
            ...context.repo,
            title: `Release ${releaseName}`,
            head: headBranch,
            base: baseBranch,
            changelog,
        });
    }

    if (createGithubRelease) {
        const releaseAlreadyExists = await createGithubReleaseFn(octokit, {
            ...context.repo,
            tag_name: releaseName,
            name: releaseName,
            target_commitish: baseBranch,
            body: changelog,
        });
        alreadyExistsExit(releaseAlreadyExists, releaseName);
    }

    if (slackChannel) {
        core.info(`Sending release notes to ${slackChannel} slack channel`);
        await sendReleaseNotesToSlack(slackToken, {
            channel: slackChannel,
            text: 'Release notes', // This is just fallback for slack api
            changelog,
            repository: context.repository,
            releaseName,
        });
    }

    // Write file to disk, because sometimes it can be easier to read it from file-system,
    // rather than interpolate it in the script, which can cause syntax error.
    // NOTE: This will work only if this action and consumer are executed within one job.
    //       For preserving the changelog between jobs, changelog file must be uploaded as artefact.
    await fs.writeFile(githubChangelogFileDestination, changelog, 'utf-8');
    core.setOutput('github-changelog', changelog);
    core.setOutput('github-changelog-file-destination', githubChangelogFileDestination);
}

run();
