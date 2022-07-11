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
    const createReleasePullRequest = core.getInput('create-pull-request') || true;
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

    // Fetch both branches with history and git message log diff
    await exec(`git fetch origin ${baseBranch} ${branch}`);
    const { stdout: gitLog } = await exec(`git log --no-merges --pretty='%s' origin/${branch} ^origin/${baseBranch}`);
    const gitMessages = gitLog.split('\n').filter((entry) => !!entry.trim());

    const releaseChangeLog = prepareChangeLog(gitMessages, scopes);

    if (createReleasePullRequest) {
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
    core.setOutput('version', version);
}

run();
