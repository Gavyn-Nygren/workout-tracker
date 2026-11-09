import { TurboModuleRegistry } from 'react-native';

/**
 * True when this build has the camera stack (VisionCamera, Nitro and the form-pose plugin): the
 * Tracker Dev build made for G4.2 or later. Expo Go and the first Tracker Dev build don't, and
 * importing VisionCamera there throws, so screens check this before loading any camera code.
 * Never throws.
 */
export function cameraStackAvailable(): boolean {
  try {
    if (TurboModuleRegistry.get('NitroModules') == null) return false;
    // Loaded only once Nitro's native half is known to be there.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NitroModules } = require('react-native-nitro-modules') as typeof import('react-native-nitro-modules');
    return NitroModules.hasHybridObject('CameraFactory') && NitroModules.hasHybridObject('FormPose');
  } catch {
    return false;
  }
}
