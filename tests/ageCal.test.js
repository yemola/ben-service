const assert = require('node:assert/strict');
const { test } = require('node:test');
const calculateAge = require('../routes/ageCal');

test('SQL Date objects match date strings around birthday boundaries', () => {
    const today = new Date();
    for (const offset of [-1, 0, 1]) {
        const birthday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        const year = birthday.getFullYear() - 30;
        const month = birthday.getMonth() + 1;
        const day = birthday.getDate();
        const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const expected = today.getFullYear() - year - (
            today.getMonth() + 1 < month ||
            (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0
        );
        assert.equal(calculateAge(value), expected);
        assert.equal(calculateAge(`${value}T00:00:00.000Z`), expected);
        assert.equal(calculateAge(new Date(`${value}T00:00:00.000Z`)), expected);
    }
});

test('missing and invalid dates return null without throwing', () => {
    for (const value of [null, undefined, '', 'invalid', new Date(NaN)]) {
        assert.equal(calculateAge(value), null);
    }
});
