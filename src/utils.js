const core = require('@actions/core');
const { WebClient } = require('@slack/web-api');
// Not very popular package, but did not find a better one.
const slackifyMarkdown = require('slackify-markdown');
const fs = require('fs/promises');
const { prepareChangeLog } = require('./change_log');

// eslint-disable-next-line max-len
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const PULL_REQUEST_BODY_NOTE = '> Edit the pull request description to your liking.'
    + ' Its content will be used to make github release and slack message';
const CHANGELOG_ANNOTATION = '<!-- CHANGELOG -->';
const CHANGELOG_REGEX = new RegExp(`${CHANGELOG_ANNOTATION}[\\s\\S]*?${CHANGELOG_ANNOTATION}`, 'mg');

async function createOrUpdatePullRequest(octokit, options) {
    const { owner, repo, head, base, changelog, ...theRestOptions } = options;
    const body = `${PULL_REQUEST_BODY_NOTE}\n${CHANGELOG_ANNOTATION}\n${changelog}${CHANGELOG_ANNOTATION}`;
    try {
        core.info(`Creating pull request ${base} <- ${head}`);
        await octokit.rest.pulls.create({
            owner,
            repo,
            head,
            base,
            body,
            ...theRestOptions,
        });
    } catch (err) {
        if (err.message && err.message.includes(`A pull request already exists`)) {
            core.info(`The pull request already exists for ${options.head}`);
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
    await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pulls[0].number,
        body,
        ...theRestOptions,
    });
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
    const { body } = (await octokit.rest.pulls.get(pullRequestOptions)).data;

    core.debug(`Pull request body ${body}`);
    // Parse changelog from pull request body
    const changelog = body.match(CHANGELOG_REGEX)[0].replaceAll(CHANGELOG_ANNOTATION, '').trim();

    if (!changelog) throw new Error('Could not get pull request body!');
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

async function getChangelogFromCompareBranches(octokit, context, baseBranch, headBranch, scopes) {
    const commitMessages = [];
    const compareResponse = await octokit.paginate('/repos/{owner}/{repo}/compare/{basehead}', {
        ...context.repo,
        basehead: `${baseBranch}...${headBranch}`,
    });
    for (const page of compareResponse) {
        for (const commit of page.commits) {
            commitMessages.push(commit.commit.message);
        }
    }
    if (!commitMessages || commitMessages.length === 0) {
        throw new Error(`Could not commits when comparing ${baseBranch}...${headBranch}`);
    }
    return prepareChangeLog(commitMessages, scopes);
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
    core.debug(`Context: ${JSON.stringify(context)}`);

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
    if (!headBranch) throw new Error('Could not determine the head branch!');

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

    core.debug(`Release name info ${JSON.stringify({ releaseName, headBranch, alreadyExists })}`);
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
    const { channel, text, changelog, repository, releaseName } = options;
    const message = `_Repository_: *${repository}* _Revision_: *${releaseName}*\n${slackifyMarkdown(changelog)}`;
    const payload = {
        text: message,
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
    getChangelogFromCompareBranches,
    getReleaseNameInfo,
    createGithubReleaseFn,
    sendReleaseNotesToSlack,
};
