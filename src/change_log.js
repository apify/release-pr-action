const core = require('@actions/core');
const commitParser = require('conventional-commits-parser');
const { OPEN_AI_IMPROVE_CHANGELOG_REQUEST, openai } = require('./open_ai');

// Convention commit cannot parse multiple scopes see https://github.com/conventional-changelog/conventional-changelog/issues/232
// We need to provide better pattern to parse header.
const HEADER_PATTERN = /^(\w*)(?:\(([\w\$\.\-\*\, ]*)\))?\: (.*)$/; // eslint-disable-line no-useless-escape

const PR_BODY_NOTE = 'You can edit changelog as you wish. '
    + 'The first Release changelog section will be published in the slack message after successful release.';

const PR_BODY_NOTE_V2 = 'There are two changelogs: The first one is generated from PR titles. '
    + 'The second one is generated using gpt-3 from the original one. '
    + `If you like the second one more, you need to delete the first one to propagate it into slack. ${PR_BODY_NOTE}`;

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

async function changeLogForSlack(changelogStructure, scopes) {
    const whitelistedScopes = Object.keys(scopes)
        .filter((scope) => (changelogStructure.user[scope].length
            || changelogStructure.admin[scope].length
            || changelogStructure.internal[scope].length));
    let isOpenaiWorks = !!process.env.OPEN_AI_TOKEN;
    const changeLogText = [];
    const changeLogV2Text = [];
    for (const scope of whitelistedScopes) {
        let scopeText = `**${scope}**\n\n`;
        let scopeTextV2 = `**${scope}**\n\n`;

        for (const changeType of ['user', 'admin', 'internal']) {
            // eslint-disable-next-line no-continue
            if (!changelogStructure[changeType][scope].length) continue;
            let changeTypeTitle;
            if (changeType === 'user') changeTypeTitle = ':rocket: _User-facing_';
            else if (changeType === 'admin') changeTypeTitle = ':nerd_face: _Admin_';
            else if (changeType === 'internal') changeTypeTitle = ':house: _Internal_';

            scopeText += `${changeTypeTitle}\n${changelogStructure[changeType][scope].map((entry) => `* ${entry}`).join('\n')}\n\n`;

            // eslint-disable-next-line no-continue
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

async function prepareChangeLog(gitMessages, scopes) {
    core.info('Generating change log ..');
    const whitelistedScopes = Object.keys(scopes);
    const changelogStructure = {
        user: {},
        admin: {},
        internal: {},
    };
    whitelistedScopes.map((scope) => {
        changelogStructure.user[scope] = [];
        changelogStructure.admin[scope] = [];
        changelogStructure.internal[scope] = [];
    });

    gitMessages
        .map((commitMessage) => commitParser.sync(commitMessage, { headerPattern: HEADER_PATTERN }))
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

    const { releaseChangelog, releaseChangelogV2 } = await changeLogForSlack(changelogStructure, scopes);

    core.info('Change log was generated successfully');
    return { releaseChangelog, releaseChangelogV2 };
}

async function improveChangeLog(changeList) {
    if (!process.env.OPEN_AI_TOKEN) throw new Error('Cannot improve changelog, missing OPEN_AI_TOKEN env variable.');
    const completion = await openai.createCompletion({
        model: 'text-davinci-003',
        prompt: `${OPEN_AI_IMPROVE_CHANGELOG_REQUEST}\n${changeList.map((line) => `* \`${line}\``).join('\n')}`,
        max_tokens: 512,
        temperature: 0.5,
    }, {
        timeout: 10000,
    });

    if (!completion.data.choices[0]) throw new Error('Cannot generate improve changelog.');

    return completion.data.choices[0].text;
}

module.exports = {
    prepareChangeLog,
    PR_BODY_NOTE,
    PR_BODY_NOTE_V2,
};
