const { Configuration, OpenAIApi } = require('openai');

const OPENAI_IMPROVE_CHANGELOG_REQUEST = `You are an expert programmer, and you are trying to rewrite release changes into user-friendly text.
For each line bellow write one meaningful sentence, starting each bullet point with a \`* \`, and the sentence ends with \`.\`.`;

const openaiConfiguration = new Configuration({
    apiKey: process.env.OPEN_AI_TOKEN,
});

module.exports = {
    openai: new OpenAIApi(openaiConfiguration),
    OPEN_AI_IMPROVE_CHANGELOG_REQUEST: OPENAI_IMPROVE_CHANGELOG_REQUEST,
};
