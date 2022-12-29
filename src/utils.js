const core = require('@actions/core');
const { WebClient } = require('@slack/web-api');
const childProcess = require('child_process');
const slackifyMarkdown = require('slackify-markdown');
const { promisify } = require('util');
const fs = require('fs/promises');
const { prepareChangeLog } = require('./change_log');
// Not very popular package, but did not find a better one.

const exec = promisify(childProcess.exec);

// eslint-disable-next-line max-len
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

async function createOrUpdatePullRequest(octokit, pullRequest) {
    const { owner, repo, head, base, ...theRestOptions } = pullRequest;
    try {
        core.info(`Creating pull request ${base} <- ${head}`);
        const { data: pull } = await octokit.rest.pulls.create(pullRequest);
        return pull;
    } catch (err) {
        if (err.message && err.message.includes(`A pull request already exists`)) {
            core.info(`The pull request already exists for ${pullRequest.head}`);
        } else {
            throw err;
        }
    }

    // Update the pull request that exists for this branch and base
    const { data: pulls } = await octokit.rest.pulls.list({
        owner,
        repo,
        head,
        base,
        state: 'open',
    });
    core.info(`Updating existing pull request #${pulls[0].number}`);
    const { data: pull } = await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pulls[0].number,
        ...theRestOptions,
    });
    return pull;
}

/**
 * This function returns payload for github pull request api calls
 * @returns object
 * @private
 */
async function getPullRequestOptions(context) {
    const eventFileContent = await fs.readFile(process.env.GITHUB_EVENT_PATH);
    const prNumber = JSON.parse(eventFileContent).pull_request.number;
    return {
        ...context.repo,
        pull_number: prNumber,
    };
}

async function getChangelogFromPullRequestDescription(octokit, context) {
    const pullRequestOptions = await getPullRequestOptions(context);
    const { pull_number: pullNumber } = pullRequestOptions;
    core.info(`Fetching changelog from pull request's description. Pull request number: ${pullNumber}`);
    const changelog = (await octokit.rest.pulls.get(pullRequestOptions)).data.body;
    if (!changelog) throw new Error('Pull request body is empty!');
    return changelog;
}

async function getChangelogFromPullRequestCommits(octokit, scopes, context) {
    const pullRequestOptions = await getPullRequestOptions(context);
    const { pull_number: pullNumber } = pullRequestOptions;
    core.info(`Fetching changelog from pull request's commits. Pull request number: ${pullNumber}`);
    const commits = await octokit.paginate('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', pullRequestOptions);
    if (!commits) throw new Error('Pull request has no commits!');
    const commitMessages = commits.map((commit) => commit.commit.message);
    if (!commitMessages) throw new Error('Could not parse commit messages!');
    return prepareChangeLog(commitMessages, scopes);
}

/**
 * NOTE: This function requires, that repository is cloned to local filesystem
 */
async function getChangelogFromGitDiff(baseBranch, headBranch, scopes) {
    await exec(`git fetch origin ${baseBranch} ${headBranch}`);
    const gitLog = await exec(`git log --no-merges --pretty='%s' origin/${headBranch} ^origin/${baseBranch}`);
    const gitMessages = gitLog.split('\n').filter((entry) => !!entry.trim());
    return prepareChangeLog(gitMessages, scopes);
}

/**
 * @param {object} context           - github action context
 * @param {string} releaseNamePrefix - prefix of semver release (i.e 'v')
 * @returns {object}
 * @private
 */
async function getReleaseNameFromReleases(octokit, context, releaseNamePrefix) {
    let releaseName;
    const releases = await octokit.rest.repos.listReleases({
        ...context.repo,
    });
    if (releases.data.length === 0) {
        releaseName = `${releaseNamePrefix}0.0.0`;
    } else {
        const { name, tag_name: tagName } = releases.data[0];
        core.info(`Discovered last release name: ${name}`);
        const tag = await octokit.rest.git.getRef({
            ...context.repo,
            ref: `tags/${tagName}`,
        });
        releaseName = name;

        const tagCommitSha = tag.data.object.sha;

        // If tag of last release already exists on current commit SHA, then do not create new release
        if (tagCommitSha === context.sha) {
            core.info(`Release with tag ${tagName} already exists! Refusing to override!`);
            return { releaseName, alreadyExists: true };
        }
        return { releaseName, alreadyExists: false };
    }
}

async function getReleaseNameInfo(octokit, context, releaseNamePrefix, releaseNameMethod) {
    let headBranch;
    let releaseName;
    let bumpMinor = false;
    let alreadyExists = false;
    let cleanVersion;

    const { eventName, headRef, refName } = context;

    if (releaseNameMethod === 'tag') {
        const release = await getReleaseNameFromReleases(octokit, context, releaseNamePrefix);
        headBranch = headRef;
        releaseName = release.releaseName;
        alreadyExists = release.alreadyExists;
        bumpMinor = true;
    } else if (releaseNameMethod === 'branch') {
        switch (eventName) {
            case 'pull_request':
                headBranch = headRef;
                break;
            case 'push':
                headBranch = refName;
                break;
            default:
                throw new Error(`Do not know how to handle event ${eventName}`);
        }
        releaseName = headBranch.split('/').pop();
    } else {
        throw new Error(`Unrecognized release-name-method: ${releaseNameMethod}`);
    }

    if (!releaseName) throw new Error('Could not determine release name!');

    if (releaseName.slice(0, releaseNamePrefix.length) === releaseNamePrefix) {
        cleanVersion = releaseName.slice(releaseNamePrefix.length);
    } else {
        cleanVersion = releaseName;
    }

    if (!SEMVER_REGEX.test(cleanVersion)) throw new Error(`Version: ${releaseName} does not uphold to semantic versioning standard!`);

    // TODO: Maybe allow also bumping something other, than minor
    if (bumpMinor) {
        const cleanVersionSplit = cleanVersion.split('.');
        const minor = cleanVersionSplit[1];
        if (!minor) throw new Error(`Version: ${releaseName} does not have a minor to bump!`);
        return {
            releaseName: `${releaseNamePrefix}${cleanVersion[0]}.${Number(minor) + 1}.${cleanVersion[0]}`,
            headBranch,
        };
    }
    return { releaseName, headBranch, alreadyExists };
}

async function createGithubReleaseFn(octokit, options) {
    let alreadyExists = false;
    try {
        await octokit.rest.repos.createRelease(options);
    } catch (error) {
        if (error.response.data.errors[0].code === 'already_exists') {
            core.info(`Release with name ${options.name} already exists! Refusing to override!`);
            alreadyExists = true;
        } else {
            throw error;
        }
    }
    return alreadyExists;
}

async function sendReleaseNotesToSlack(slackToken, options) {
    const { channel, text, changelog } = options;
    const payload = {
        text: slackifyMarkdown(changelog),
    };
    const slack = new WebClient(slackToken);
    await slack.chat.postMessage({
        channel,
        text,
        ...payload,
    });
}

module.exports = {
    createOrUpdatePullRequest,
    getChangelogFromPullRequestDescription,
    getChangelogFromPullRequestCommits,
    getChangelogFromGitDiff,
    getReleaseNameInfo,
    createGithubReleaseFn,
    sendReleaseNotesToSlack,
};