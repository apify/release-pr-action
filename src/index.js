const core = require('@actions/core');
const github = require('@actions/github');
const childProcess = require('child_process');
const fs = require('fs/promises');
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
    const changelogFileDestination = core.getInput('changelog-file-destination') || 'changelog.txt';

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

    let releaseChangeLog;
    if (compareMethod === 'pull_request') {
        // Get PR number
        const eventFileContent = await fs.readFile(process.env.GITHUB_EVENT_PATH);
        const prNumber = JSON.parse(eventFileContent).pull_request.number;

        if (!prNumber) throw new Error('Could not obtain pull request\'s number. Was the workflow trigger "pull_request"?');
        releaseChangeLog = (await repoOctokit.rest.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber,
        })).data.body;
        if (!releaseChangeLog) throw new Error('Could not get changelog from PR description');
    } else {
        let gitLog;
        // Fetch base and head branches with history and git message log diff
        // TODO: Maybe we could use github API in this part as well
        if (compareMethod === 'branch') {
            await exec(`git fetch origin ${baseBranch} ${branch}`);
            ({ stdout: gitLog } = await exec(`git log --no-merges --pretty='%s' origin/${branch} ^origin/${baseBranch}`));
        } else if (compareMethod === 'tag') {
            // NOTE: This method does not work as expected, because commits cannot be sorted by merge date,
            //       thus changelog does not have to contain all the commit messages

            // fetch base branch and get commit history from latest tag. If tag is not found fetch whole history.
            await exec(`git fetch origin ${baseBranch}`);
            const { stdout: tag } = await exec(`git describe --tags --abbrev=0`);
            const start = tag ? `${tag.replace(/[\r\n]/gm, '')}..` : '';
            ({ stdout: gitLog } = await exec(`git log --no-merges --pretty='%s' ${start}HEAD`));
        } else {
            throw new Error(`Unrecognized "compare-method" value: ${compareMethod}`);
        }
        const gitMessages = gitLog.split('\n').filter((entry) => !!entry.trim());
        releaseChangeLog = prepareChangeLog(gitMessages, scopes);
    }

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
    // Write file to disk, because sometimes it can be easier to read it from file-system,
    // rather than interpolate it in the script, which can cause syntax error.
    // NOTE: This will work only if this action and consumer are executed within one job.
    //       For preserving the changelog between jobs, changelog file must be uploaded as artefact.
    await fs.writeFile(changelogFileDestination, releaseChangeLog, 'utf-8');
    core.setOutput('changelog', releaseChangeLog);
    core.setOutput('changelogFileDestination', changelogFileDestination);
}

run();
