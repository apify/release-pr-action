const { prepareChangeLog } = require('./change_log');

test('extracts multiple PR numbers from commits', async () => {
    const scopes = { Worker: ['worker'] };
    const gitMessages = [
        'feat: first feature (#10)',
        'fix: bug fix (#5)',
        'feat(worker): another feature (#20)',
        'chore: update deps (#15)',
        'feat: feature without PR number',
    ];
    const { changelog, includedPrNumbers } = await prepareChangeLog(gitMessages, scopes);
    expect(includedPrNumbers).toEqual([5, 10, 15, 20]); // Should be sorted
    expect(changelog).toContain('first feature');
    expect(changelog).toContain('bug fix');
});

test('log correctly prepared', async () => {
    const scopes = { Worker: ['worker'] };
    const gitMessages = [
        'feat: some admin change [admin]',
        'feat: just new feature with scope',
        'feat(worker): worker scope internal change [internal]',
        'chore(ci): Change to ignore [skip ci]',
        'feat(worker): Update packages [internal]',
        'feat: Change sign-up text (#46)',
    ];
    const { changelog, includedPrNumbers } = await prepareChangeLog(gitMessages, scopes);
    expect(changelog).toEqual(`**Worker**

:rocket: _User-facing_
* just new feature with scope
* Change sign-up text

:nerd_face: _Admin_
* some admin change

:house: _Internal_
* worker scope internal change
* Update packages

`);
    expect(includedPrNumbers).toEqual([46]);
});

test('log correctly prepared for monorepo', async () => {
    const scopes = { Console: ['app', 'console'], Api: ['api'], Empty: ['empty'] };
    const gitMessages = [
        'feat(app): some admin change [admin]',
        'feat(console): feature with console scope',
        'feat(api): Api internal change [internal]',
        'feat(api): [internal]',
        'chore(ci, app, api): Change to ignore [skip ci]',
        'chore(ci): Change to ignore [ignore][admin]',
        'feat(api): Api change for user',
        'feat(app, api, ci): App + Api change for user',
        'fix(ci): Some ci fix should be internal',
        'feat(api): New cool feature in API 💥 (#46)',
        'feat(intl): Change sign-up text (#46)',
    ];
    const { changelog, includedPrNumbers } = await prepareChangeLog(gitMessages, scopes);
    expect(changelog).toEqual(`**Console**

:rocket: _User-facing_
* feature with console scope
* App + Api change for user

:nerd_face: _Admin_
* some admin change

:house: _Internal_
* Some ci fix should be internal
* Change sign-up text


**Api**

:rocket: _User-facing_
* Api change for user
* New cool feature in API 💥

:house: _Internal_
* Api internal change

`);
    expect(includedPrNumbers).toEqual([46]);
});

test('log correctly using openAI', async () => {
    if (!process.env.OPEN_AI_TOKEN) {
        console.warn('OPEN_AI_TOKEN not set, skipping test!');
        return;
    }
    const scopes = { Console: ['app', 'console'], Api: ['api'], Empty: ['empty'] };
    const gitMessages = [
        'feat(app): some admin change [admin]',
        'feat(console): feature with console scope',
        'feat(api): Api internal change [internal]',
        'chore(ci, app, api): Change to ignore [skip ci]',
        'chore(ci): Change to ignore [ignore][admin]',
        'feat(api): Api change for user',
        'feat(app, api, ci): App + Api change for user',
        'fix(ci): Some ci fix should be internal',
        'feat(api): New cool feature in API 💥 (#46)',
        'feat(intl): Change sign-up text (#46)',
    ];
    const { changelog, includedPrNumbers } = await prepareChangeLog(gitMessages, scopes);
    // NOTE: OpenAI is not deterministic, so we can't test for exact string, let's print it out to be able check.
    console.log(changelog);
    expect(changelog).toEqual(expect.stringContaining('**Console**'));
    expect(changelog).toEqual(expect.stringContaining('**Api**'));
    expect(includedPrNumbers).toEqual([46]);
});
