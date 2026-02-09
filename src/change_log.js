const core = require('@actions/core');
const commitParser = require('conventional-commits-parser');

const {
    OPEN_AI_IMPROVE_CHANGELOG_REQUEST,
    OPEN_AI_IMPROVE_CHANGELOG_ROLE_DEFINITION,
    openai,
} = require('./open_ai');

// Convention commit cannot parse multiple scopes see https://github.com/conventional-changelog/conventional-changelog/issues/232
// We need to provide better pattern to parse header.
const HEADER_PATTERN = /^(\w*)(?:\(([\w\$\.\-\*\, ]*)\))?\: (.*)$/; // eslint-disable-line no-useless-escape

/*
 * Commit message flags
 * Use to mark commit messages and PR titles with flag in square brackets.
 */
const GIT_MESSAGE_FLAGS = {
    IGNORE: 'ignore',
    SKIP_CI: 'skip ci',
    INTERNAL: 'internal',
    ADMIN: 'admin',
};

const GIT_COMMIT_INFRA_SCOPE = 'infra';
const GIT_COMMIT_CI_SCOPE = 'ci';

/**
 * Converts structured changelog (object) to changelog message (string)
 * @param {*} changelogStructure - changelog object
 * @param {*} scopes             - convectional commits scopes to group changelog items
 * @returns {string}
 */
async function structureChangelog(changelogStructure, scopes) {
    const whitelistedScopes = Object.keys(scopes)
        .filter((scope) => (changelogStructure.user[scope].length
            || changelogStructure.admin[scope].length
            || changelogStructure.internal[scope].length));
    let isOpenaiWorks = !!openai;
    const changeLogText = [];
    const changeLogV2Text = [];
    for (const scope of whitelistedScopes) {
        let scopeText = `**${scope}**\n\n`;
        let scopeTextV2 = `**${scope}**\n\n`;

        for (const changeType of ['user', 'admin', 'internal']) {
            if (!changelogStructure[changeType][scope].length) continue;
            let changeTypeTitle;
            if (changeType === 'user') changeTypeTitle = ':rocket: _User-facing_';
            else if (changeType === 'admin') changeTypeTitle = ':nerd_face: _Admin_';
            else if (changeType === 'internal') changeTypeTitle = ':house: _Internal_';

            scopeText += `${changeTypeTitle}\n${changelogStructure[changeType][scope].map((entry) => `* ${entry}`).join('\n')}\n\n`;

            if (!isOpenaiWorks) continue;
            try {
                const improvedText = await improveChangeLog(changelogStructure[changeType][scope]);
                scopeTextV2 += `${changeTypeTitle}\n${improvedText.trim()}\n\n`;
            } catch (err) {
                isOpenaiWorks = false;
                core.error(err);
            }
        }
        changeLogText.push(scopeText);
        changeLogV2Text.push(scopeTextV2);
    }
    return {
        releaseChangelog: changeLogText.join('\n'),
        releaseChangelogV2: isOpenaiWorks ? changeLogV2Text.join('\n') : null,
    };
}

// Regex to extract PR numbers from commit messages (e.g., "(#123)" or "#123")
const PR_NUMBER_REGEX = /\(#(\d+)\)|(?<!\()#(\d+)(?!\))/g;

/**
 * Extract PR numbers from a commit message
 * @param {string} message - commit message
 * @returns {number[]} - array of PR numbers found
 */
function extractPrNumbers(message) {
    const prNumbers = [];
    let match;
    while ((match = PR_NUMBER_REGEX.exec(message)) !== null) {
        // match[1] is from (#123), match[2] is from #123
        const prNumber = parseInt(match[1] || match[2], 10);
        if (!prNumbers.includes(prNumber)) {
            prNumbers.push(prNumber);
        }
    }
    // Reset regex lastIndex for next use
    PR_NUMBER_REGEX.lastIndex = 0;
    return prNumbers;
}

/**
 * Parse commit messages and convert them into human readable changelog
 * @param {*} gitMessages - commit messages
 * @param {*} scopes      - convectional commits scopes to group changelog items
 * @returns {Promise<{ changelog: string, includedPrNumbers: number[] }>}
 */
async function prepareChangeLog(gitMessages, scopes) {
    core.info('Generating change log ..');
    const whitelistedScopes = Object.keys(scopes);
    const changelogStructure = {
        user: {},
        admin: {},
        internal: {},
    };
    const allPrNumbers = new Set();

    whitelistedScopes.map((scope) => {
        changelogStructure.user[scope] = [];
        changelogStructure.admin[scope] = [];
        changelogStructure.internal[scope] = [];
    });

    gitMessages
        .map((commitMessage) => {
            // Extract PR numbers before parsing
            const prNumbers = extractPrNumbers(commitMessage);
            prNumbers.forEach((num) => allPrNumbers.add(num));
            return commitParser.sync(commitMessage, { headerPattern: HEADER_PATTERN });
        })
        .filter((parsed) => !!parsed.subject) // Filter out commits that didn't match conventional commit
        .map((parsed) => {
            // Remove links `(#23)` on github PR/issue, it will not look good in slack message
            parsed.subject = parsed.subject.replace(/\(#\d+\)/g, '').trim();
            const flagsInMessage = parsed.subject.match(/\[([^\]]*)\]/g);
            parsed.flags = flagsInMessage && flagsInMessage.map((flag) => {
                parsed.subject = parsed.subject.replace(flag, '').trim();
                return flag.replace(/(\[|\])/g, '').trim();
            });
            parsed.scopes = parsed.scope && parsed.scope.split(',').map((item) => item.trim());
            return parsed;
        })
        .filter((entry) => {
            // Filter out commits with empty string as subject
            if (!entry.subject.trim()) {
                return false;
            }
            // Filter out [skip ci] and [ignore] commits
            if (entry.flags && (entry.flags.includes(GIT_MESSAGE_FLAGS.SKIP_CI)
                || entry.flags.includes(GIT_MESSAGE_FLAGS.IGNORE))) {
                return false;
            }
            return true;
        })
        .forEach((entry) => {
            // Consider the first scope as default
            const defaultScope = whitelistedScopes[0];
            // Check if change is user-facing/internal/admin
            let changeType = 'user'; // User-facing is by default
            if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.INTERNAL)) {
                changeType = 'internal';
            } else if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
                changeType = 'admin';
            }

            // Consider single scope with infra or ci as internal changes
            if (entry.scopes && entry.scopes.length === 1
                && (entry.scopes.includes(GIT_COMMIT_INFRA_SCOPE) || entry.scopes.includes(GIT_COMMIT_CI_SCOPE))) {
                changeType = 'internal';
            }

            // Find the scope of change
            if (!entry.scopes || entry.scopes.length === 0) {
                // Consider the first scope as default and use it for commits without scope
                changelogStructure[changeType][defaultScope].push(entry.subject);
            } else {
                let scopeFound = false;
                for (const scope of whitelistedScopes) {
                    const targetScopes = scopes[scope];
                    const scopeMatch = entry.scopes.find((entryScope) => targetScopes.includes(entryScope));
                    if (scopeMatch) {
                        changelogStructure[changeType][scope].push(entry.subject);
                        scopeFound = true;
                        break;
                    }
                }
                if (!scopeFound) {
                    // TODO: What about commit with different scope
                    // For now consider the rest as internal changes
                    changelogStructure.internal[defaultScope].push(entry.subject);
                    core.warning(`Cannot properly set scope into change log for commit message: ${entry.subject}`);
                }
            }
        });
    // .forEach((entry) => {
    //     if (entry.scopes && (entry.scopes.includes(GIT_COMMIT_APP_SCOPE) || entry.scopes.includes(GIT_COMMIT_CONSOLE_SCOPE))) {
    //         if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.INTERNAL)) {
    //             changelogStructure.internal.push(`Console: ${entry.subject}`);
    //         } else if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
    //             changelogStructure.admin.app.push(entry.subject);
    //         } else {
    //             changelogStructure.user.app.push(entry.subject);
    //         }
    //     } else if (entry.scopes && entry.scopes.includes(GIT_COMMIT_API_SCOPE)) {
    //         if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.INTERNAL)) {
    //             changelogStructure.internal.push(`Api: ${entry.subject}`);
    //         } else if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
    //             changelogStructure.admin.api.push(entry.subject);
    //         } else {
    //             changelogStructure.user.api.push(entry.subject);
    //         }
    //     } else if (entry.scopes
    //         && entry.scopes.length === 1
    //         && (entry.scopes.includes(GIT_COMMIT_INFRA_SCOPE) || entry.scopes.includes(GIT_COMMIT_CI_SCOPE))) {
    //         // Consider single scope with infra or ci as internal changes
    //         changelogStructure.internal.push(entry.subject);
    //     } else {
    //         // TODO: What about the rest?
    //         // For now consider the rest as internal changes
    //         if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
    //             changelogStructure.admin.api.push(entry.subject);
    //         } else {
    //             changelogStructure.internal.push(entry.subject);
    //         }
    //         core.warning(`Cannot properly set scope into change log for commit message: ${entry.subject}`);
    //     }
    // });

    const { releaseChangelog, releaseChangelogV2 } = await structureChangelog(changelogStructure, scopes);

    core.info('Change log was generated successfully');
    const includedPrNumbers = Array.from(allPrNumbers).sort((a, b) => a - b);
    return {
        changelog: releaseChangelogV2 || releaseChangelog,
        includedPrNumbers,
    };
}

async function improveChangeLog(changeList) {
    if (!openai) throw new Error('Cannot improve changelog, missing open AI token.');
    const completion = await openai.createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: OPEN_AI_IMPROVE_CHANGELOG_ROLE_DEFINITION,
            },
            {
                role: 'user',
                content: OPEN_AI_IMPROVE_CHANGELOG_REQUEST,
            },
            {
                role: 'user',
                content: changeList.map((line) => `* \`${line}\``).join('\n'),
            },
        ],
        temperature: 0.1,
    }, {
        timeout: 20000,
    });

    if (!completion.data?.choices[0]?.message) throw new Error('Cannot generate improve changelog.');

    return completion.data?.choices[0]?.message?.content;
}

module.exports = {
    prepareChangeLog,
};
