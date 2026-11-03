// The owner's content review page (G3.13): the committed CONTENT_REVIEW.md must equal what the
// code renders, so a change to a program, the library, the rules or the tour shows up as a diff
// to re-review. Regenerate it from client/ with: node --import tsx tests/tools/writeContentReview.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { renderContentReview } from '../src/data/content/reviewDoc';
import { STARTER_TEMPLATES } from '../src/data/content/templates';
import { GOLDEN_ROWS } from '../src/features/onboarding/rules';

const COMMITTED = join(__dirname, '..', '..', 'CONTENT_REVIEW.md');
const lf = (text: string) => text.replace(/\r\n/g, '\n');
const rendered = renderContentReview();

describe('content review page', () => {
  test('the committed CONTENT_REVIEW.md matches the code (regenerate with tests/tools/writeContentReview.ts)', () => {
    const committed = lf(readFileSync(COMMITTED, 'utf8'));
    // Point at the first line that differs, rather than dumping two 2,000-line strings.
    const a = committed.split('\n');
    const b = rendered.split('\n');
    const first = a.findIndex((line, i) => line !== b[i]);
    const at = first === -1 ? Math.min(a.length, b.length) : first;
    assert.ok(committed === rendered, `CONTENT_REVIEW.md is out of date at line ${at + 1}:\n  file: ${a[at] ?? '(end)'}\n  code: ${b[at] ?? '(end)'}`);
  });

  test('two renders are identical', () => {
    assert.equal(renderContentReview(), rendered);
  });

  test('LF line endings and a final newline', () => {
    assert.ok(!rendered.includes('\r'));
    assert.ok(rendered.endsWith('\n') && !rendered.endsWith('\n\n'));
  });

  test('kg steps read as the engine takes them: never 2.3 kg or 4.5 kg', () => {
    assert.doesNotMatch(rendered, /\b2\.3 kg|\b4\.5 kg/);
    assert.match(rendered, /\+5 lb \/ \+2\.5 kg at top of range/);
    assert.match(rendered, /\+5 lb \/ \+2 kg at top of range/);
    assert.match(rendered, /\+10 lb \/ \+5 kg at top of range/);
  });

  test('every program, every workout, the golden rows and the tour are on the page', () => {
    STARTER_TEMPLATES.forEach((t, i) => {
      assert.ok(rendered.includes(`\n### ${i + 1}. ${t.name}\n`), t.name);
      for (const w of t.workouts) assert.ok(rendered.includes(`\n#### ${w.name}\n`), `${t.name} > ${w.name}`);
    });
    for (const row of GOLDEN_ROWS) assert.ok(rendered.includes(`**Example ${row.n}.** Answers: ${row.label}.`), `golden row ${row.n}`);
    assert.ok(rendered.includes('\n## 5. The tour\n'));
  });

  test('plain text: no emoji and no "!"', () => {
    assert.doesNotMatch(rendered, /\p{Extended_Pictographic}/u);
    assert.ok(!rendered.includes('!'));
  });

  test("uses the app's style label, not the brand name", () => {
    assert.ok(rendered.includes('| Full range |'));
    assert.doesNotMatch(rendered, /\bATG\b/);
  });
});
