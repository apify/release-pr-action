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
const GIT_COMMIT_APP_SCOPE = 'app';
const GIT_COMMIT_API_SCOPE = 'api';
const GIT_COMMIT_INFRA_SCOPE = 'infra';
const GIT_COMMIT_CI_SCOPE = 'ci';

function changeLogForSlack({ user, admin, internal }) {
    let text = '';
    if (user.app.length || user.api.length) {
        text += ':rocket: _User-facing_\n\n';
    }
    if (user.app.length) {
        text += `**App**\n${user.app.map((entry) => `* ${entry}`)
            .join('\n')}\n\n`;
    }
    if (user.api.length) {
        text += `**Api**\n${user.api.map((entry) => `* ${entry}`)
            .join('\n')}\n\n`;
    }
    if (admin.app.length || admin.api.length) {
        text += ':nerd_face: _Admin_\n\n';
    }
    if (admin.app.length) {
        text += `**App**\n${admin.app.map((entry) => `* ${entry}`)
            .join('\n')}\n\n`;
    }
    if (admin.api.length) {
        text += `**Api**\n${admin.api.map((entry) => `* ${entry}`)
            .join('\n')}\n\n`;
    }
    if (internal.length) {
        text += `:house: _Internal_\n${internal.map((entry) => `* ${entry}`)
            .join('\n')}\n\n`;
    }
    return text;
}

function prepareChangeLog(gitMessages) {
    core.info('Generating change log ..');
    const changelogStructure = {
        user: {
            app: [],
            api: [],
        },
        admin: {
            app: [],
            api: [],
        },
        internal: [],
    };

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
            if (entry.scopes && entry.scopes.includes(GIT_COMMIT_APP_SCOPE)) {
                if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.INTERNAL)) {
                    changelogStructure.internal.push(`App: ${entry.subject}`);
                } else if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
                    changelogStructure.admin.app.push(entry.subject);
                } else {
                    changelogStructure.user.app.push(entry.subject);
                }
            } else if (entry.scopes && entry.scopes.includes(GIT_COMMIT_API_SCOPE)) {
                if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.INTERNAL)) {
                    changelogStructure.internal.push(`Api: ${entry.subject}`);
                } else if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
                    changelogStructure.admin.api.push(entry.subject);
                } else {
                    changelogStructure.user.api.push(entry.subject);
                }
            } else if (entry.scopes
                && entry.scopes.length === 1
                && (entry.scopes.includes(GIT_COMMIT_INFRA_SCOPE) || entry.scopes.includes(GIT_COMMIT_CI_SCOPE))) {
                // Consider single scope with infra or ci as internal changes
                changelogStructure.internal.push(entry.subject);
            } else {
                // TODO: What about the rest?
                // For now consider the rest as internal changes
                if (entry.flags && entry.flags.includes(GIT_MESSAGE_FLAGS.ADMIN)) {
                    changelogStructure.admin.api.push(entry.subject);
                } else {
                    changelogStructure.internal.push(entry.subject);
                }
                core.warning(`Cannot properly set scope into change log for commit message: ${entry.subject}`);
            }
        });

    const releaseChangelog = changeLogForSlack(changelogStructure);

    core.info('Change log was generated successfully');
    return releaseChangelog;
}

module.exports = {
    prepareChangeLog,
};
