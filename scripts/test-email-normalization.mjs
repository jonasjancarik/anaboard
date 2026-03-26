import assert from 'node:assert/strict';

import {
  canonicalizeEmailAddress,
  getOriginalEmailAddress,
  normalizeEmailAddress,
} from '../src/features/auth/emailAddress.ts';

assert.equal(
  getOriginalEmailAddress('  John.Doe+School@Gmail.com  '),
  'John.Doe+School@Gmail.com'
);

assert.equal(
  canonicalizeEmailAddress(' John.Doe+School@Gmail.com '),
  'johndoe@gmail.com'
);

assert.equal(
  canonicalizeEmailAddress('Jane.Doe@googlemail.com'),
  'janedoe@gmail.com'
);

assert.deepEqual(normalizeEmailAddress('  Name+Tag@Example.COM '), {
  original: 'Name+Tag@Example.COM',
  canonical: 'name+tag@example.com',
  provider: null,
});

console.log('email normalization ok');
