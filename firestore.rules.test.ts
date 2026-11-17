import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesText = fs.readFileSync(rulesPath, 'utf8');

test('firestore.rules enforces zero-trust default deny and Dirty Dozen invariants', () => {
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /data\.keys\(\)\.hasAll\(/);
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.ownerId == existing\(\)\.ownerId/);
  assert.match(rulesText, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesText, /diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);
});

test('firestore.rules isolates private account email in /users/{userId}/private/{docId}', () => {
  assert.match(rulesText, /match \/users\/\{userId\}/);
  assert.match(rulesText, /match \/private\/\{docId\}/);
  assert.match(rulesText, /existsAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\)\.data\.ownerId == request\.auth\.uid/);
});
