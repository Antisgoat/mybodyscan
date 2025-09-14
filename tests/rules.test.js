import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const rules = readFileSync('database.rules.json', 'utf8');

describe('Firestore security rules', () => {
  it('contains restrictions on user reads and updates', () => {
    assert.match(rules, /match \/users\/\{uid\}/);
    assert.match(rules, /allow read: if isOwner\(uid\);/);
    assert.match(rules, /allow update: if isOwner\(uid\)\s*&& !changed\(\)\.hasAny\(\[[^\]]*'credits'/);
  });

  it('disallows writes to coach plans', () => {
    assert.match(rules, /match \/coach\/plan\/\{doc=\*\*\} \{\s*allow read: if isOwner\(uid\);\s*allow write: if false;/);
  });

  it('blocks user creation with sensitive fields', () => {
    assert.match(
      rules,
      /allow create: if isOwner\(uid\)[\s\S]*!request.resource.data.keys\(\)\.hasAny\([\s\S]*'credits'[\s\S]*'stripeCustomerId'/
    );
  });

  it('allows only note updates on scans', () => {
    assert.match(
      rules,
      /match \/scans\/\{scanId\} \{[\s\S]*allow update: if isOwner\(uid\)\s*&& changed\(\)\.hasOnly\(\['note','notes','noteUpdatedAt'\]\);/
    );
  });

  it('blocks sensitive scan field creation', () => {
    assert.match(
      rules,
      /match \/scans\/\{scanId\} \{[\s\S]*!request.resource.data.keys\(\)\.hasAny\([\s\S]*'results'/
    );
  });

  it('allows nutrition log writes with bounds', () => {
    assert.match(
      rules,
      /match \/nutritionLogs\/\{day\} \{\s*allow read, write: if isOwner\(uid\)[\s\S]*calories is number[\s\S]*<= 10000/
    );
  });
});
