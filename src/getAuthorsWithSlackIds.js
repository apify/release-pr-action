const core = require('@actions/core');
const { WebClient } = require('@slack/web-api');

async function getEmailToSlackIdMap(slackToken) {
    core.info(`Trying to fetch Slack users`);
    const slack = new WebClient(slackToken);
    const { members } = await slack.users.list({});
    core.info(`Fetched ${members.length} Slack users`);

    // Create mapping from emails to Slack IDs.
    return members
        .filter((user) => user.id && user.profile?.email)
        .reduce((acc, user) => {
            acc[user.profile.email] = user.id;
            return acc;
        }, {});
}

async function getGitHubUsernameToEmailMap(githubToken) {
    const query = '{\n'
        + '  repository(name: "apify-core", owner: "apify") {\n'
        + '    collaborators {\n'
        + '      edges {\n'
        + '        node {\n'
        + '          login\n'
        + '          name\n'
        + '          organizationVerifiedDomainEmails(login: "apify") {}\n'
        + '        }\n'
        + '      }\n'
        + '    }\n'
        + '  }\n'
        + '}';

    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `bearer ${process.env.GITHUB_TOKEN}`,
        },
        body: JSON.stringify({ query }),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Apify org member emails. Status: ${response.status}`);
    }

    const { data: { repository: { collaborators: { edges } } } } = await response.json();

    core.info(JSON.stringify(edges));
    console.log(edges);
}

/**
 * Enhance authors with Slack IDs matching their email addresses.
 *
 * If the whole function fails, or some emails cannot be matched, the original authors are returned.
 *
 * @param {string} githubToken
 * @param {string} slackToken
 * @param {array<{ name: string, email: string }>} authors
 * @returns {Promise<array<{ name: string, email: string, slackId?: string }>>}
 */
async function getAuthorsWithSlackIds(githubToken, slackToken, authors) {
    if (!authors.length) {
        core.info('No authors to fetch Slack IDs for');
        return authors;
    }

    await getGitHubUsernameToEmailMap(githubToken);

    try {
        // Create mapping from emails to Slack IDs.
        const emailToSlackIdMap = getEmailToSlackIdMap(slackToken);

        return authors.map((author) => {
            const slackId = emailToSlackIdMap[author.email];

            if (!slackId) {
                core.warning(`Slack ID not found for ${author.email}`);
                return author;
            }

            return { ...author, slackId };
        });
    } catch (e) {
        // Let's not kill the whole action.
        core.warning(`Failed getting authors with Slack IDs. Error: ${JSON.stringify(e)}`);
        return authors;
    }
}

module.exports = {
    getAuthorsWithSlackIds,
};
