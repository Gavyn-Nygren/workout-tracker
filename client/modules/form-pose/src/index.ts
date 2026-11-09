import { NitroModules } from 'react-native-nitro-modules';
import type { FormPose } from './specs/FormPose.nitro';

export type * from './specs/FormPose.nitro';

/** Creates the pose plugin. Only call it when hasFormPose() says the build includes it. */
export function createFormPose(): FormPose {
  return NitroModules.createHybridObject<FormPose>('FormPose');
}
