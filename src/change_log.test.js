const { prepareChangeLog } = require('./change_log');

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
    const releaseChangelog = await prepareChangeLog(gitMessages, scopes);
    expect(releaseChangelog).toEqual(`**Worker**

:rocket: _User-facing_
* just new feature with scope
* Change sign-up text

:nerd_face: _Admin_
* some admin change

:house: _Internal_
* worker scope internal change
* Update packages

`);
});

test('log correctly prepared for monorepo', async () => {
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
    const releaseChangelog = await prepareChangeLog(gitMessages, scopes);
    expect(releaseChangelog).toEqual(`**Console**

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
});
