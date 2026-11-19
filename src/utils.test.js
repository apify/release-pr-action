const { formatIncludedPrsList, resolveMergedPullRequest, getReleaseNameInfo } = require('./utils.js');

test('formatIncludedPrsList formats PR numbers correctly', () => {
    const result = formatIncludedPrsList([1, 5, 10]);
    expect(result).toBe('\n\n## Included Pull Requests\n- #1\n- #5\n- #10');
});

test('formatIncludedPrsList handles empty input', () => {
    expect(formatIncludedPrsList([])).toBe('');
    expect(formatIncludedPrsList(null)).toBe('');
    expect(formatIncludedPrsList(undefined)).toBe('');
});

describe('resolveMergedPullRequest', () => {
    const context = { repo: { owner: 'apify', repo: 'x' }, sha: 'abc' };
    const octokitWith = (data) => ({ rest: { repos: { listPullRequestsAssociatedWithCommit: async () => ({ data }) } } });
    const pr = (over) => ({ number: 7, merged_at: '2026-01-01', base: { ref: 'master' }, head: { ref: 'release/v1.2.3' }, merge_commit_sha: 'abc', ...over });

    test('returns the pull request merged by the commit into the base branch', async () => {
        const result = await resolveMergedPullRequest(octokitWith([pr({ number: 1, merged_at: null }), pr()]), context, 'master');
        expect(result.number).toBe(7);
    });

    test.each([
        ['not merged', { merged_at: null }],
        ['merged into a different base', { base: { ref: 'develop' } }],
        ['merged by a different commit', { merge_commit_sha: 'other' }],
    ])('returns null when the pull request is %s', async (_name, over) => {
        expect(await resolveMergedPullRequest(octokitWith([pr(over)]), context, 'master')).toBeNull();
    });
});

describe('getReleaseNameInfo on push', () => {
    test('uses the head branch of the merged pull request when resolved', async () => {
        const context = { eventName: 'push', refName: 'master', headRef: 'release/v1.2.3' };
        const result = await getReleaseNameInfo({}, context, 'v', 'branch');
        expect(result).toMatchObject({ releaseName: 'v1.2.3', headBranch: 'release/v1.2.3' });
    });

    test('falls back to the pushed ref name', async () => {
        const context = { eventName: 'push', refName: 'release/v1.2.3', headRef: '' };
        const result = await getReleaseNameInfo({}, context, 'v', 'branch');
        expect(result).toMatchObject({ releaseName: 'v1.2.3', headBranch: 'release/v1.2.3' });
    });
});
