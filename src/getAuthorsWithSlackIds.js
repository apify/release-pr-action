const core = require('@actions/core');
const { WebClient } = require('@slack/web-api');

/**
 * Create mapping from @apify.com emails to Slack IDs.
 * @returns {Promise<{ [email: string]: string }>}
 */
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

/**
 * Create mapping from GitHub usernames to @apify.com emails.
 * @returns {Promise<{ [login: string]: string }>}
 */
async function getGitHubLoginToEmailMap(githubToken) {
    core.info('Trying to fetch @apify.com email addresses for Apify org members');

    const query = '{\n'
        + '  repository(name: "release-pr-action", owner: "apify") {\n'
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
            Authorizatioffn: `bearer ${githubToken}`,
        },
        body: JSON.stringify({ query }),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Apify org member emails. Response ${await response.text()}`);
    }

    const { data: { repository: { collaborators: { edges } } } } = await response.json();

    core.info(`Fetched ${edges.length} Apify org members`);

    return edges.reduce((acc, { node: { login, organizationVerifiedDomainEmails } }) => {
        acc[login] = organizationVerifiedDomainEmails.length > 0 ? organizationVerifiedDomainEmails[0] : null;
        return acc;
    }, {});
}

/**
 * Enhance authors with Slack IDs matching their email addresses.
 *
 * If the whole function fails, or some emails cannot be matched, the original authors are returned.
 *
 * @param {string} githubToken
 * @param {string} slackToken
 * @param {array<{ name: string, email: string, login: string }>} authors
 * @returns {Promise<array<{ name: string, email: string, login: string, slackId?: string }>>}
 */
async function getAuthorsWithSlackIds(githubToken, slackToken, authors) {
    if (!authors.length) {
        core.info('No authors to fetch Slack IDs for');
        return authors;
    }

    const githubLoginToEmailMap = await getGitHubLoginToEmailMap(githubToken);
    const emailToSlackIdMap = await getEmailToSlackIdMap(slackToken);

    return authors.map((author) => {
        const slackId = emailToSlackIdMap[githubLoginToEmailMap[author.login] || author.email];

        if (!slackId) {
            core.warning(`Slack ID not found for ${author.name} (${author.login} / ${author.email})`);
            return author;
        }

        return { ...author, slackId };
    });
}

module.exports = {
    getAuthorsWithSlackIds,
};
