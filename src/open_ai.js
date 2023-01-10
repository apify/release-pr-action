const { Configuration, OpenAIApi } = require('openai');
const core = require('@actions/core');

const OPEN_AI_IMPROVE_CHANGELOG_REQUEST = `You are an expert programmer, and you are trying to rewrite release changes into user-friendly text.
For each line below, write one meaningful past infinitive sentence, starting each bullet point with a \`* \`, and the sentence ends with \`.\`.`;

const OPEN_AI_TOKEN = core.getInput('open-ai-token') || process.env.OPEN_AI_TOKEN;

const openaiConfiguration = new Configuration({
    apiKey: OPEN_AI_TOKEN,
});

module.exports = {
    openai: OPEN_AI_TOKEN ? new OpenAIApi(openaiConfiguration) : null,
    OPEN_AI_IMPROVE_CHANGELOG_REQUEST,
};
