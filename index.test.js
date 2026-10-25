const test = require('node:test');
const assert = require('node:assert');
test('smoke', () => assert.ok(require('./index').smoke()));
