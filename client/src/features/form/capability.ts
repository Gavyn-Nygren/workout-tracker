import * as Device from 'expo-device';

/**
 * On-device pose analysis needs an A14 chip or newer (spec 2.2): iPhone 12 and later
 * ("iPhone13,x" model IDs and up) and iPads from "iPad13,x". Simulators and unknown models are
 * allowed so development isn't blocked.
 */
export function isFormAnalysisSupported(): boolean {
  const id = Device.modelId;
  if (!id || !Device.isDevice) return true;
  const match = /^(iPhone|iPad)(\d+),/.exec(id);
  if (!match) return true;
  const generation = Number(match[2]);
  return generation >= 13;
}
