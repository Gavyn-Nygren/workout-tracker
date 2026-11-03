# Development build: setup guide (G4.1)

The development build is the app's own copy on your iPhone, called **Tracker Dev**. Like Expo Go, it loads the code from your PC, so code changes still reload instantly. Unlike Expo Go, it can run the native code that form analysis needs (camera, pose detection), and it shows the app's real icon, splash and permission prompts.

Everything in the project is set up. What's left needs your accounts, so you run these steps yourself. Run every command in a terminal in the `client` folder.

**Costs:** the Apple Developer Program is US$99 a year. The free Expo plan includes 15 iOS builds a month, and you only need a new build when native settings change (see the end of this guide).

## Before you start: wrap up Expo Go

Expo Go and Tracker Dev keep separate data. Nothing you logged in Expo Go moves across, and Tracker Dev starts with sample data.

1. If anything you logged in Expo Go matters, export it: **Profile → Data & account → Everything as JSON**, then save it to Files. There's no import yet, so this is only a copy for safekeeping.
2. Turn off every notification in **Profile → Notifications**, with the app open, so Expo Go cancels its reminders. Otherwise you'd get each reminder twice, once from each app. After step 4 below, Expo Go can no longer cancel them.

## 1. Join the Apple Developer Program

- Enroll as an **Individual** in the Apple Developer app on your iPhone, or at developer.apple.com/programs/enroll.
- Use your legal name, and an Apple Account with two-factor authentication turned on.
- Confirmation usually takes about a day. If you haven't heard back within 24 hours of paying, contact Apple.

## 2. Check your Expo account

You already have one, because Expo Go requires it. Run `npx expo whoami` to see the account name; use that same account below.

## 3. Install the EAS command-line tool

```
npm install --global eas-cli
eas login
eas whoami
```

`eas login` opens a browser window to sign in.

## 4. Link the project

```
eas init
```

This creates the project on expo.dev and adds its ID to `app.json`. Tell me when it's done, and I'll commit that change.

## 5. Register your iPhone

```
eas device:create
```

1. Sign in with your Apple ID when asked, and choose **Website**.
2. Scan the QR code it shows with the iPhone camera, then tap **Download Profile**.
3. Open **Settings**, tap **Profile Downloaded** near the top, and tap **Install**.

## 6. Build

```
eas build --profile development --platform ios
```

It asks a few questions:

| Question | Answer |
|---|---|
| Log in to your Apple account? | Yes. Enter your Apple ID password and the 2FA code. On Windows it isn't saved, so you'll type it again whenever EAS needs Apple. |
| Generate a new Apple Distribution Certificate? | Yes |
| Select devices for the ad hoc build | Your iPhone (selected already) |

The build runs in Expo's cloud. On the free plan it waits in a queue, so it can take a while; you can close the terminal and follow it on expo.dev.

**If the build fails over the device:** on a new membership, Apple can take up to 72 hours to activate a newly registered device. Wait, then run the same command again.

## 7. Install on the iPhone

1. When the build finishes, scan the QR code in the terminal with the iPhone camera, then tap Install. (You can also open the build on expo.dev and tap **Install**.)
2. Tap the **Tracker Dev** icon. iOS says Developer Mode is required: tap OK.
3. Go to **Settings → Privacy & Security → Developer Mode**, turn it on, and restart the phone.
4. After the restart, tap **Turn On** and enter your passcode. You only do this once.

## 8. Run it

1. On the PC, run `npm start` in `client`. The phone and PC need to be on the same Wi-Fi, as with Expo Go.
2. Open **Tracker Dev**. Tap **Allow** when iOS asks to find devices on your local network. If you tapped Don't Allow, turn it on in **Settings → Tracker Dev → Local Network**.
3. Tap your PC's server in the list, or scan the QR code from the terminal with the iPhone camera.

- **Developer menu:** shake the phone (or press `m` in the terminal). Press `r` in the terminal to reload.
- **If it can't connect:** run `npx expo start --tunnel` instead. It's slower, but it gets through Wi-Fi and firewall problems.
- **To use Expo Go meanwhile:** run `npm run start:go` instead. Expo Go keeps working until G4.2 adds the camera.

## 9. Check it on the phone

This is the G4.1 check: everything from before should still work, and these things are new.

- **Home screen:** the icon in light mode, dark mode and tinted (long-press the home screen → Edit → Customize), labelled **Tracker Dev**.
- **Launch:** the splash in light and dark mode, with no white flash when the phone is in dark mode.
- **First run:** Profile → Developer → **Restart first-run setup** shows welcome, onboarding and the tour. iOS permission prompts (notifications, Face ID, local network) now name Tracker Dev instead of Expo Go.
- **Notifications:**
  1. Turn one on and allow notifications.
  2. Profile → Developer → **Preview notifications**, then tap each one and check it opens the right screen.
  3. Close the app fully, tap a reminder, and check Today opens (the PC must be running `npm start`).
  4. Developer → **Pending notifications** should list only the app's own, plus "Rest alarm pending." during a rest.
- **Rest timer:** start a rest, lock the phone, and check the alarm arrives.
- **Face ID lock:**
  1. Profile → Privacy → turn on **Face ID lock**. iOS asks once, with the line "Face ID unlocks the app when the app lock is on. The app never sees your face." Tap Allow.
  2. Then try Settings → Tracker Dev → turn Face ID off: the Privacy row should say your passcode unlocks it, and the switch still turns off.
- **Everything else:** log a full workout, start a program, check Progress charts, export data (share sheet), the date pickers, haptics, and the tour with VoiceOver and with Reduce Motion.

## When a new build is needed

Code changes reload from the PC as before, with no new build. A new build (step 6 again, then step 7) is only needed when a native package or a native setting changes: `app.json`, `app.config.ts` or `eas.json`. I'll say so whenever a change needs one. G4.2 (camera) will be the first.
