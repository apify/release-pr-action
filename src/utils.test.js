const { findOriginalAuthorOfCopilotCommit } = require('./utils.js');

describe('Co-authored-by parsing in Copilot commits', () => {
    it('parses login from noreply email', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Some One <12345+expected-github-login@users.noreply.github.com>
        `);

        expect(authorLogin).toEqual('expected-github-login');
    });

    it('ignores trailer if no parsable username found', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
Another commit message

some other description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Somé Onežý <custom.email@apify.com>
        `);

        expect(authorLogin).toEqual(null);
    });

    it('parses login from author name', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: expected-github-login <a-random-email@apify.com>
        `);

        expect(authorLogin).toEqual('expected-github-login');
    });

    it('returns first non-Copilot co-author when multiple exist', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: first-author <12345+first-author@users.noreply.github.com>
Co-authored-by: second-author <67890+second-author@users.noreply.github.com>
        `);

        expect(authorLogin).toEqual('first-author');
    });

    it('handles emails with multiple plus characters', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Some User <12345+user+extra@users.noreply.github.com>
        `);

        // split('+') splits on ALL '+' characters, so we get ["12345", "user", "extra"]
        // We take the second element "user" which is a valid GitHub username
        expect(authorLogin).toEqual('user');
    });

    it('trims whitespace from author names', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by:  trimmed-username  <email@example.com>
        `);

        expect(authorLogin).toEqual('trimmed-username');
    });

    it('rejects usernames with underscores in noreply emails', () => {
        const authorLogin = findOriginalAuthorOfCopilotCommit(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Some User <12345+user_name@users.noreply.github.com>
        `);

        expect(authorLogin).toEqual(null);
    });
});
