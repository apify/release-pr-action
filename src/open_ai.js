const core = require('@actions/core');
const { Configuration, OpenAIApi } = require('openai');

const OPEN_AI_IMPROVE_CHANGELOG_ROLE_DEFINITION = 'Act as a Tech Writer with knowledge of programming in node js. '
    + 'You will act with passion on detail and will be able to write a changelog for a release in user friendly text.'
    + 'You will fix grammar and spelling mistakes as well. ';

const OPEN_AI_IMPROVE_CHANGELOG_REQUEST = 'Rewrite release changes into user-friendly text. '
    + 'For each line below, write one meaningful past infinitive sentence, starting each bullet point with a `* `, and the sentence ends with `.`.';

const OPEN_AI_TOKEN = core.getInput('open-ai-token') || process.env.OPEN_AI_TOKEN;

const openaiConfiguration = new Configuration({
    apiKey: OPEN_AI_TOKEN,
});

module.exports = {
    openai: OPEN_AI_TOKEN ? new OpenAIApi(openaiConfiguration) : null,
    OPEN_AI_IMPROVE_CHANGELOG_REQUEST,
    OPEN_AI_IMPROVE_CHANGELOG_ROLE_DEFINITION,
};
