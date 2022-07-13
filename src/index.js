const core = require('@actions/core');
const github = require('@actions/github');
const childProcess = require('child_process');
const { promisify } = require('util');
const { prepareChangeLog } = require('./change_log');
const { createOrUpdatePullRequest } = require('./pr_helper');

const exec = promisify(childProcess.exec);

async function run() {
    const repoToken = core.getInput('repo-token');
    const changelogScopes = core.getInput('changelog-scopes');
    const baseBranch = core.getInput('base-branch') || 'master';
    // inputs are always strings hence default is 'true' and not true
    const createReleasePullRequest = core.getInput('create-pull-request') || 'true';
    const compareMethod = core.getInput('compare-method') || 'branch';
    const { ref } = github.context;
    const version = ref.split('/').pop();
    const branch = ref.split('heads/').pop();
    const repoOctokit = github.getOctokit(repoToken);

    let scopes;
    try {
        scopes = JSON.parse(changelogScopes);
    } catch (err) {
        throw new Error('The changelog-scopes input cannot be parsed as JSON.');
    }

    let gitLog;
    // Fetch base and head branches with history and git message log diff
    if (compareMethod === 'branch') {
        await exec(`git fetch origin ${baseBranch} ${branch}`);
        ({ stdout: gitLog } = await exec(`git log --no-merges --pretty='%s' origin/${branch} ^origin/${baseBranch}`));
    } else if (compareMethod === 'tag') {
        // fetch base branch and get commit history from latest tag. If tag is not found fetch whole history.
        await exec(`git fetch origin ${baseBranch}`);
        const { stdout: tag } = await exec(`git describe --tags --abbrev=0`);
        const start = tag ? `${tag.replace(/[\r\n]/gm, '')}..` : '';
        ({ stdout: gitLog } = await exec(`git log --no-merges --pretty='%s' ${start}HEAD`));
    } else {
        throw new Error(`Unrecognized "compare-method" value: ${compareMethod}`);
    }

    const gitMessages = gitLog.split('\n').filter((entry) => !!entry.trim());
    const releaseChangeLog = prepareChangeLog(gitMessages, scopes);

    if (createReleasePullRequest === 'true') {
        core.info('Opening the release pull request');
        await createOrUpdatePullRequest(repoOctokit, {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            title: `Release ${version}`,
            head: branch,
            base: baseBranch,
            body: `# Release changelog\n`
            + `${releaseChangeLog}`,
        });
    }
    core.setOutput('changelog', releaseChangeLog);
}

run();
