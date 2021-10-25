const core = require('@actions/core');

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

module.exports = {
    createOrUpdatePullRequest,
};
