// Writes the owner's content review page (G3.13) to CONTENT_REVIEW.md at the repo root, from
// renderContentReview() in src/data/content/reviewDoc.ts. Run it from client/ after changing a
// starter program, the library, the recommendation rules or the tour copy:
//
//   node --import tsx tests/tools/writeContentReview.ts
//
// tests/contentReview.test.ts fails until the committed file matches the code again. Not a
// *.test.ts file, so npm test doesn't run it.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderContentReview } from '../../src/data/content/reviewDoc';

/** The repo root's CONTENT_REVIEW.md (this file is client/tests/tools/). */
const CONTENT_REVIEW_PATH = join(__dirname, '..', '..', '..', 'CONTENT_REVIEW.md');

// LF line endings, whatever the platform.
const text = renderContentReview().replace(/\r\n/g, '\n');
writeFileSync(CONTENT_REVIEW_PATH, text, 'utf8');
console.log(`Wrote ${CONTENT_REVIEW_PATH} (${text.split('\n').length - 1} lines)`);
