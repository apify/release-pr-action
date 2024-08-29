const core = require('@actions/core');
const { WebClient } = require('@slack/web-api');

/**
 * Enhance authors with Slack IDs matching their email addresses.
 *
 * If the whole function fails, or some emails cannot be matched, the original authors are returned.
 *
 * @param {string} slackToken
 * @param {array<{ name: string, email: string }>} authors
 * @returns {Promise<array<{ name: string, email: string, slackId?: string }>>}
 */
async function getAuthorsWithSlackIds(slackToken, authors) {
    if (!authors.length) {
        core.info('No authors to fetch Slack IDs for');
        return authors;
    }

    try {
        core.info(`Trying to fetch Slack users`);
        const slack = new WebClient(slackToken);
        const { members } = await slack.users.list({});
        core.info(`Fetched ${members.length} Slack users`);

        // Create mapping from emails to Slack IDs.
        const emailToSlackId = members
            .filter((user) => user.id && user.profile?.email)
            .reduce((acc, user) => {
                acc[user.profile.email] = user.id;
                return acc;
            }, {});

        return authors.map((author) => {
            const slackId = emailToSlackId[author.email];

            if (!slackId) {
                core.warning(`Slack ID not found for ${author.email}`);
                return author;
            }

            return { ...author, slackId };
        });
    } catch (e) {
        // Let's not kill the whole action.
        core.warning(`Failed getting authors with Slack IDs: ${JSON.stringify(e)}`);
        return authors;
    }
}

module.exports = {
    getAuthorsWithSlackIds,
};
