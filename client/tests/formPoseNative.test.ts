// The form-pose plugin's Swift can only be compiled on a Mac (the GitHub compile check or an EAS
// build), so these checks catch the mistakes that are visible from here (G4.2):
// - Nitro lowercases multi-word union members in Swift ('frameSwapped' is `.frameswapped`), so
//   the hand-written Swift must use the generated names.
// - The generated bridge must be up to date with the spec (run `npx nitrogen` in modules/form-pose).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const moduleDir = new URL('../modules/form-pose/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, moduleDir), 'utf8');
const generatedSwift = new URL('nitrogen/generated/ios/swift/', moduleDir);
const handWritten = readdirSync(new URL('ios/', moduleDir))
  .filter((f) => f.endsWith('.swift'))
  .map((f) => ({ file: f, text: read(`ios/${f}`) }));

/** Each generated enum's JS string → Swift case, from `case "jsName":\n self = .swiftName`. */
function generatedEnums(): Map<string, Map<string, string>> {
  const enums = new Map<string, Map<string, string>>();
  for (const file of readdirSync(generatedSwift)) {
    const text = readFileSync(new URL(file, generatedSwift), 'utf8');
    const name = /public typealias (\w+) = margelo\.nitro\.formpose\.\w+\n\npublic extension \1 \{\n {2}\/\*\*\n {3}\* Get a/.exec(text)?.[1];
    if (!name) continue;
    const cases = new Map<string, string>();
    for (const m of text.matchAll(/case "([^"]+)":\s*\n\s*self = \.(\w+)/g)) cases.set(m[1], m[2]);
    if (cases.size > 0) enums.set(name, cases);
  }
  return enums;
}

describe('form-pose native code', () => {
  test('the generated enums are there', () => {
    const enums = generatedEnums();
    for (const name of ['PoseEngine', 'PoseModel', 'PoseDelegate', 'PoseOrientationMode']) assert.ok(enums.has(name), `${name} is generated`);
  });

  test("hand-written Swift uses the generated case names, not the JS ones Nitro renamed", () => {
    for (const [name, cases] of generatedEnums()) {
      for (const [js, swift] of cases) {
        if (js === swift) continue;
        for (const { file, text } of handWritten) {
          assert.ok(!new RegExp(`\\.${js}\\b`).test(text), `${file} uses .${js}; Nitro's Swift name for ${name}.${js} is .${swift}`);
        }
      }
    }
  });

  test('the generated bridge matches the spec (every union member in the spec is generated)', () => {
    const spec = read('src/specs/FormPose.nitro.ts');
    const enums = generatedEnums();
    for (const m of spec.matchAll(/export type (\w+) = ((?:'[^']+'(?: \| )?)+);/g)) {
      const members = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      const generated = enums.get(m[1]);
      assert.ok(generated, `${m[1]} is generated; run npx nitrogen in modules/form-pose`);
      assert.deepEqual([...generated.keys()].sort(), [...members].sort(), `${m[1]} is up to date; run npx nitrogen in modules/form-pose`);
    }
  });
});
