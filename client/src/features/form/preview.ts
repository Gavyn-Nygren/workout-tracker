/**
 * True while form recording is a mock: the posed skeleton stands in for the camera and the report
 * is a sample (until G4.3). The tour's preview line, the setup screen's "PREVIEW · MOCK CAMERA" tag
 * and the review screen's preview note all read this one flag, so switching it off at G4.3 (a
 * roadmap line says so) removes every mention at once.
 *
 * Its own pure module because capability.ts imports expo-device, and tests import the tour copy.
 */
export const FORM_ANALYSIS_PREVIEW: boolean = true;
