# App icon source

`app-icon.svg` is the master artwork for the app icon (roadmap G2.12, the user's pick: a black weight plate with a blue color-code stripe, stamped "45 LB / 20 KG", lit progress ticks, and a gold PR hand).

The PNGs in `../` were rendered from it with resvg at 1024 px:

- `icon.png`: the iOS light icon and the default icon.
- `icon-dark.png`: the same art without the background, for the iOS 18 dark home screen.
- `icon-tinted.png`: the dark version in grayscale, flattened onto opaque black, for the tinted home screen. Keep it opaque: Expo fills any transparency in the tinted icon with white, which tints as a bright tile.
- `splash-icon.png`: the plate alone, centered by expo-splash-screen on #F2F4F7 (light) or #0B0D10 (dark).
- `android-icon-*.png`: the adaptive-icon foreground, scaled into the safe zone, and a monochrome silhouette.

The stamped lettering uses Arial Black, so render on a machine that has it, or convert the text to paths first.
