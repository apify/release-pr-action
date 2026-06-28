const { getCommitCoauthors, parseIgnoredAuthors, formatIncludedPrsList } = require('./utils.js');

describe('getCommitCoauthors', () => {
    const logins = (message) => getCommitCoauthors(message).map((coauthor) => coauthor.login);

    it('parses login from noreply email', () => {
        expect(logins(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Some One <12345+expected-github-login@users.noreply.github.com>
        `)).toEqual(['Copilot', 'expected-github-login']);
    });

    it('returns the parsed login, name and email of each co-author', () => {
        const coauthors = getCommitCoauthors(`\
A commit message

some description

Co-authored-by: Some One <12345+expected-github-login@users.noreply.github.com>
        `);

        expect(coauthors).toEqual([{
            login: 'expected-github-login',
            name: 'Some One',
            email: '12345+expected-github-login@users.noreply.github.com',
        }]);
    });

    it('skips trailer if no parsable username found', () => {
        expect(logins(`\
Another commit message

some other description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Somé Onežý <custom.email@apify.com>
        `)).toEqual(['Copilot']);
    });

    it('parses login from author name', () => {
        expect(logins(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: expected-github-login <a-random-email@apify.com>
        `)).toEqual(['Copilot', 'expected-github-login']);
    });

    it('returns all coauthors in order', () => {
        expect(logins(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: first-author <12345+first-author@users.noreply.github.com>
Co-authored-by: second-author <67890+second-author@users.noreply.github.com>
        `)).toEqual(['Copilot', 'first-author', 'second-author']);
    });

    it('handles emails with multiple plus characters', () => {
        // split('+') splits on ALL '+' characters, so we get ["12345", "user", "extra"]
        // We take the second element "user" which is a valid GitHub username
        expect(logins(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Some User <12345+user+extra@users.noreply.github.com>
        `)).toEqual(['Copilot', 'user']);
    });

    it('trims whitespace from author names', () => {
        expect(logins(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by:  trimmed-username  <email@example.com>
        `)).toEqual(['Copilot', 'trimmed-username']);
    });

    it('rejects usernames with underscores in noreply emails', () => {
        expect(logins(`\
A commit message

some description

Co-authored-by: Copilot <Copilot@users.noreply.github.com>
Co-authored-by: Some User <12345+user_name@users.noreply.github.com>
        `)).toEqual(['Copilot']);
    });

    it('de-duplicates co-authors by login', () => {
        expect(logins(`\
A commit message

Co-authored-by: alice <1+alice@users.noreply.github.com>
Co-authored-by: alice <1+alice@users.noreply.github.com>
        `)).toEqual(['alice']);
    });

    it('returns empty array when no Co-authored-by trailers exist', () => {
        expect(getCommitCoauthors('Just a normal commit\n\nwith a body.')).toEqual([]);
    });

    it('is idempotent across multiple calls (regex state reset)', () => {
        const message = `Title\n\nCo-authored-by: alice <1+alice@users.noreply.github.com>\n`;

        expect(logins(message)).toEqual(['alice']);
        expect(logins(message)).toEqual(['alice']);
    });
});

describe('parseIgnoredAuthors', () => {
    it('parses, trims and lower-cases a comma-separated list', () => {
        expect(parseIgnoredAuthors(' Copilot, Claude ,Foo')).toEqual(new Set(['copilot', 'claude', 'foo']));
    });

    it('drops empty entries', () => {
        expect(parseIgnoredAuthors('copilot,,, ,claude')).toEqual(new Set(['copilot', 'claude']));
    });

    it('returns an empty set for empty or missing input', () => {
        expect(parseIgnoredAuthors('')).toEqual(new Set());
        expect(parseIgnoredAuthors(undefined)).toEqual(new Set());
    });
});

test('formatIncludedPrsList formats PR numbers correctly', () => {
    const result = formatIncludedPrsList([1, 5, 10]);
    expect(result).toBe('\n\n## Included Pull Requests\n- #1\n- #5\n- #10');
});

test('formatIncludedPrsList handles empty input', () => {
    expect(formatIncludedPrsList([])).toBe('');
    expect(formatIncludedPrsList(null)).toBe('');
    expect(formatIncludedPrsList(undefined)).toBe('');
});
