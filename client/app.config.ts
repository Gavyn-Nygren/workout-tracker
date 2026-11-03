import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App variants. The development build is its own app ("Tracker Dev", bundle id ending in .dev), so
 * it can sit beside a normal build of the app without sharing its data. app.json holds the real
 * app's config; this only changes what differs.
 *
 * APP_VARIANT comes from the build profile in eas.json. When it's unset (running `npx expo start`
 * on the PC) it's 'development', so no environment variable is needed on Windows.
 */
export type AppVariant = 'development' | 'production';

export const DEV_SUFFIX = '.dev';
export const DEV_NAME = 'Tracker Dev';

export function appVariant(value: string | undefined): AppVariant {
  if (value === undefined || value === '' || value === 'development') return 'development';
  if (value === 'production') return 'production';
  throw new Error(`APP_VARIANT must be "development" or "production", not "${value}".`);
}

export function withVariant(config: ExpoConfig, variant: AppVariant): ExpoConfig {
  if (variant === 'production') return config;
  return {
    ...config,
    name: DEV_NAME,
    scheme: `${config.scheme}-dev`,
    ios: { ...config.ios, bundleIdentifier: `${config.ios?.bundleIdentifier}${DEV_SUFFIX}` },
    android: { ...config.android, package: `${config.android?.package}${DEV_SUFFIX}` },
  };
}

export default ({ config }: ConfigContext): ExpoConfig => withVariant(config as ExpoConfig, appVariant(process.env.APP_VARIANT));
