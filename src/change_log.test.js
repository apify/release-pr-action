const { prepareChangeLog } = require('./change_log');

test('log correctly prepared', () => {
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
    const result = prepareChangeLog(gitMessages);
    expect(result).toEqual(`:rocket: _User-facing_

**Console**
* feature with console scope
* App + Api change for user

**Api**
* Api change for user
* New cool feature in API 💥

:nerd_face: _Admin_

**Console**
* some admin change

:house: _Internal_
* Api: Api internal change
* Some ci fix should be internal
* Change sign-up text

`);
});
