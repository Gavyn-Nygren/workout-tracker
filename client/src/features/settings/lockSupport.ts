/**
 * Whether this phone can use the app lock, and how (spec 2.3: Face ID, with the passcode as the
 * fallback when Face ID fails or is unavailable). Pure, so it's tested without iOS.
 *
 * - 'faceId': Face ID is set up and allowed for this app.
 * - 'faceIdOff': the phone has Face ID, but this app was denied it in iOS Settings; the passcode works.
 * - 'passcode': a passcode but no usable Face ID (not set up, or no Face ID on this phone).
 * - 'none': no passcode, so there's nothing to unlock with.
 */
export type LockSupport = 'faceId' | 'faceIdOff' | 'passcode' | 'none';

/** What expo-local-authentication reports. `level` is its SecurityLevel: 0 none, 1 passcode, 2+ biometrics. */
export type LockProbe = {
  level: number;
  /** supportedAuthenticationTypesAsync includes facial recognition (true even when the app is denied). */
  faceIdPhone: boolean;
  /** hasHardwareAsync: false on a Face ID phone means the app was denied Face ID. */
  biometryAllowed: boolean;
};

export function lockSupport({ level, faceIdPhone, biometryAllowed }: LockProbe): LockSupport {
  if (level <= 0) return 'none';
  if (level >= 2) return 'faceId';
  if (faceIdPhone && !biometryAllowed) return 'faceIdOff';
  return 'passcode';
}

/** The Face ID lock row's subtitle. Undefined support (still checking) reads like Face ID is ready. */
export function lockSubtitle(support: LockSupport | undefined): string {
  switch (support) {
    case 'faceIdOff':
      return 'Face ID is off for this app in iOS Settings, so your passcode unlocks it.';
    case 'passcode':
      return 'Unlock the app with your passcode. Set up Face ID in iOS Settings to use it too.';
    case 'none':
      return 'Set a passcode in iOS Settings to use this.';
    default:
      return 'Unlock the app with Face ID, or your passcode as a fallback';
  }
}

/**
 * The switch can always be turned off. It can be turned on unless the phone has no passcode, so a
 * lock that's on is never stuck (for example after Face ID is denied for this app).
 */
export function lockSwitchDisabled(support: LockSupport | undefined, enabled: boolean): boolean {
  return support === 'none' && !enabled;
}
