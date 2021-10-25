const { prepareChangeLog } = require('./change_log');

test('log correctly prepared', () => {
    const gitMessages = [
        'feat(app): some admin change [admin]',
        'feat(api): Api internal change [internal]',
        'chore(ci, app, api): Change to ignore [skip ci]',
        'chore(ci): Change to ignore [ignore][admin]',
        'feat(api): Api change for user',
        'feat(app, api, ci): App + Api change for user',
        'fix(ci): Some ci fix should be internal',
    ];
    const result = prepareChangeLog(gitMessages);
    expect(result).toEqual(`:rocket: _User-facing_

**App**
* App + Api change for user

**Api**
* Api change for user

:nerd_face: _Admin_

**App**
* some admin change

:house: _Internal_
* Api: Api internal change
* Some ci fix should be internal

`);
});
