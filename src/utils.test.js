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
});
