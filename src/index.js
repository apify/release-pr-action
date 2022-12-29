const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs/promises');
const {
    createOrUpdatePullRequest,
    getChangelogFromPullRequestDescription,
    getChangelogFromPullRequestCommits,
    getChangelogFromGitDiff,
    getReleaseNameInfo,
    createGithubReleaseFn,
    sendReleaseNotesToSlack,
} = require('./utils');

function alreadyExistsExit(alreadyExists, releaseName) {
    if (alreadyExists) {
        core.info(`Release ${releaseName} already exists. Exiting..`);
        process.exit(0);
    }
}

async function createChangelog(
    method,
    octokit,
    scopes,
    context,
    baseBranch,
    headBranch,
) {
    let githubChangelog;

    switch (method) {
        case 'pull_request_description':
            githubChangelog = await getChangelogFromPullRequestDescription(octokit, context);
            break;
        case 'pull_request_commits':
            githubChangelog = await getChangelogFromPullRequestCommits(octokit, scopes, context);
            break;
        case 'git_diff':
            githubChangelog = await getChangelogFromGitDiff(baseBranch, headBranch, scopes);
            break;
        default:
            core.error(`Unrecognized "changelog-method" input: ${method}`);
            break;
    }
    return githubChangelog;
}

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

    core.debug(`createChangelog headBranch: ${headBranch}`);
    const githubChangelog = await createChangelog(
        changelogMethod,
        octokit,
        scopes,
        context,
        baseBranch,
        headBranch,
    );

    if (createReleasePullRequest) {
        core.info('Opening the release pull request');
        await createOrUpdatePullRequest(octokit, {
            ...context.repo,
            title: `Release ${releaseName}`,
            head: headBranch,
            base: baseBranch,
            body: githubChangelog,
        });
    }

    if (createGithubRelease) {
        const releaseAlreadyExists = await createGithubReleaseFn(octokit, {
            ...context.repo,
            tag_name: releaseName,
            name: releaseName,
            target_commitish: baseBranch,
            body: githubChangelog,
        });
        alreadyExistsExit(releaseAlreadyExists, releaseName);
    }

    if (slackChannel) {
        core.info(`Sending release notes to ${slackChannel} slack channel`);
        await sendReleaseNotesToSlack(slackToken, {
            channel: slackChannel,
            text: 'Release notes', // This is just fallback for slack api
            changelog: githubChangelog,
        });
    }

    // Write file to disk, because sometimes it can be easier to read it from file-system,
    // rather than interpolate it in the script, which can cause syntax error.
    // NOTE: This will work only if this action and consumer are executed within one job.
    //       For preserving the changelog between jobs, changelog file must be uploaded as artefact.
    await fs.writeFile(githubChangelogFileDestination, githubChangelog, 'utf-8');
    core.setOutput('github-changelog', githubChangelog);
    core.setOutput('github-changelog-file-destination', githubChangelogFileDestination);
}

run();
