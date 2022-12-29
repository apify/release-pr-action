const core = require('@actions/core');
const commitParser = require('conventional-commits-parser');
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

function structureChangelog(changelogStructure, scopes) {
    const whitelistedScopes = Object.keys(scopes);
    const scopesText = whitelistedScopes
        // filter out empty scopes
        .filter((scope) => (changelogStructure.user[scope].length
            || changelogStructure.admin[scope].length
            || changelogStructure.internal[scope].length))
        .map((scope) => {
            let text = `**${scope}**\n\n`;
            if (changelogStructure.user[scope].length) {
                text += `:rocket: _User-facing_\n${changelogStructure.user[scope].map((entry) => `* ${entry}`).join('\n')}\n\n`;
            }

            if (changelogStructure.admin[scope].length) {
                text += `:nerd_face: _Admin_\n${changelogStructure.admin[scope].map((entry) => `* ${entry}`).join('\n')}\n\n`;
            }

            if (changelogStructure.internal[scope].length) {
                text += `:house: _Internal_\n${changelogStructure.internal[scope].map((entry) => `* ${entry}`).join('\n')}\n\n`;
            }
            return text;
        });
    return scopesText.join('\n');
}

function prepareChangeLog(gitMessages, scopes) {
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

    const githubChangelog = structureChangelog(changelogStructure, scopes);

    core.info('Change log was generated successfully');
    return githubChangelog;
}

module.exports = {
    prepareChangeLog,
};
