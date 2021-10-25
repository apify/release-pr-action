const core = require('@actions/core');
const github = require('@actions/github');
const childProcess = require('child_process');
const { promisify } = require('util');
const { prepareChangeLog } = require('./change_log');
const { createOrUpdatePullRequest } = require('./pr_helper');

const exec = promisify(childProcess.exec);

async function run() {
    const repoToken = core.getInput('repo-token');
    const baseBranch = core.getInput('base-branch') || 'master';
    const { ref } = github.context;
    const version = ref.split('/').pop();
    const branch = ref.split('heads/').pop();
    const repoOctokit = github.getOctokit(repoToken);

    // Fetch both branches with history and git message log diff
    await exec(`git fetch origin ${baseBranch} ${branch}`);
    const { stdout: gitLog } = await exec(`git log --no-merges --pretty='%s' origin/${branch} ^origin/${baseBranch}`);
    const gitMessages = gitLog.split('\n').filter((entry) => !!entry.trim());

    const releaseChangeLog = prepareChangeLog(gitMessages);
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

run();
