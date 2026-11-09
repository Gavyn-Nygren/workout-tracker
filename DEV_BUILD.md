# Development build: setup guide (G4.1)

The development build is the app's own copy on your iPhone, called **Tracker Dev**. Like Expo Go, it loads the code from your PC, so code changes still reload instantly. Unlike Expo Go, it can run the native code that form analysis needs (camera, pose detection), and it shows the app's real icon, splash and permission prompts.

Steps 1-4 are done. Steps 5-7 need your Apple ID, so you run them yourself. Run every command in a terminal in the `client` folder: in VS Code, **Terminal → New Terminal**, then `cd client`.

**Costs:** the Apple Developer Program is US$99 a year. The free Expo plan includes 15 iOS builds a month, and you only need a new build when native settings change (see the end of this guide).

## Expo Go after the switch

Expo Go and Tracker Dev keep separate data. Nothing you logged in Expo Go moves across, and Tracker Dev starts with sample data.

Since the project was linked (step 4), Expo Go opens the app with fresh data too, and it can no longer cancel reminders it scheduled before. If you ever get a reminder twice, turn off notifications for Expo Go in **iOS Settings → Expo Go → Notifications** (or delete Expo Go once Tracker Dev works).

## 1. Join the Apple Developer Program (done)

An Individual membership, on the Apple Account you'll sign in with in steps 5 and 6.

## 2-4. Expo account, EAS tool and project link (done)

- The project is **@gavyn17/exercise-tracker** on expo.dev, owned by your personal account. Its ID and owner are in `app.json`.
- The EAS command-line tool is installed on this PC, and it uses the same sign-in as `npx expo`.
- On another PC, run `npm install --global eas-cli`, then `eas whoami`. Only if it says you're not logged in, run `eas login`.

## 5. Register your iPhone

```
eas device:create
```

1. **Would you like to use the gavyn17 account?** Yes.
2. Sign in to Apple with your Apple ID and password. For the 2FA code, choose **device**, tap Allow on the iPhone, and type the 6-digit code it shows. On Windows the password isn't saved, but the sign-in is kept, so step 6 usually won't ask again.
3. **How would you like to register your devices?** Choose **Website**.
4. Scan the QR code with the iPhone camera, open the link, and tap **Download Profile** (tap Allow if Safari asks).
5. Within 8 minutes, open **Settings**, tap **Profile Downloaded** near the top, tap **Install**, and follow the prompts (passcode, Install). The phone returns to the browser, which says the device is registered. If iOS won't install it while you're away from home, Stolen Device Protection is blocking it: do this step at home.

## 6. Build

```
eas build --profile development --platform ios
```

It asks a few questions:

| Question | Answer |
|---|---|
| Do you want to log in to your Apple account? | Yes. Your Apple ID is already filled in: press Return. EAS usually reuses the sign-in from step 5 ("Logged in Local session") and skips the password. If it does ask, enter the password and 2FA code as in step 5. Windows can't store the password, even though EAS prints "Saving Apple ID password to the local Keychain". |
| Generate a new Apple Distribution Certificate? | Yes. (On a later try it asks **Reuse this distribution certificate?** instead: Yes.) |
| Select devices for the ad hoc build | Your iPhone (selected already): press Return |
| Would you like to reuse the profile? (later builds only) | Yes |

It also registers the app with Apple and turns on Sign In with Apple by itself ("Synced capabilities: Enabled: Sign In with Apple"). There's no push notifications question.

The build runs in Expo's cloud. On the free plan it waits in a queue, so it can take a while; you can close the terminal and follow it on expo.dev.

**If your iPhone isn't ready at Apple yet:** on a new membership, Apple can take 24-72 hours to finish processing a newly registered device (EAS sends it to Apple during this first build). You'll see one of two things:

- The command stops with an error about devices or the provisioning profile.
- It warns "Failed to provision 1 of the selected devices" and asks **Do you want to continue without provisioning these devices?**. Choose **No (EAS CLI will exit)**. Yes is selected by default, and a build made without your iPhone can't be installed on it.

Either way nothing is used up, because this happens before the upload. Wait, then run the same command again. (If you picked Yes by mistake, the next run says the provisioning profile is missing your iPhone and asks **Would you like to choose the devices to provision again?**: answer Yes.)

## 7. Install on the iPhone

1. When the build finishes, scan the QR code in the terminal with the iPhone camera, then tap Install. (You can also open the build on expo.dev and tap **Install**.)
2. Tap the **Tracker Dev** icon. iOS says Developer Mode is required: tap OK.
3. Go to **Settings → Privacy & Security → Developer Mode**, turn it on, and restart the phone.
4. After the restart, tap **Turn On** and enter your passcode. You only do this once.

## 8. Run it

1. On the PC, run `npm start` in `client`. The phone and PC need to be on the same Wi-Fi, as with Expo Go.
2. Open **Tracker Dev**. The first time, it shows **Finding Dev Servers**: tap **Next**, tap **Allow** when iOS asks to find devices on your local network, then tap **Done**. If you tapped Don't Allow, turn it on in **Settings → Tracker Dev → Local Network**.
3. Under **Development servers**, tap **Tracker Dev** (it shows your PC's address, ending in `:8081`), or scan the QR code from the terminal with the iPhone camera.

- **Developer menu:** shake the phone (or press `m` in the terminal). Press `r` in the terminal to reload.
- **If it can't connect:** run `npx expo start --tunnel` instead. It's slower, but it gets through Wi-Fi and firewall problems.
- **To use Expo Go meanwhile:** run `npm run start:go` instead. Expo Go runs everything except the camera spike (G4.2), which needs Tracker Dev.

## 9. Check it on the phone

This is the G4.1 check: everything from before should still work, and these things are new.

- **Home screen:** the icon in light mode, dark mode and tinted (long-press the home screen → Edit → Customize), labelled **Tracker Dev**. Tinted should be a dark plate with tint-coloured ticks and lettering, not a bright tile.
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

## 10. The camera spike (G4.2)

G4.2 adds the camera, pose detection and a live skeleton, so it needs **build 2** of Tracker Dev. Until it's installed, Profile → Developer → Camera spike says it needs the new build, and everything else works as before (Expo Go too).

### Make and install build 2

1. In VS Code, check the bottom-left corner says the branch **g4.2-spike** (the camera code lives there until the spike is done).
2. In the `client` terminal, run `eas build --profile development --platform ios` again. Answer as in step 6: reuse the certificate and the profile. A GitHub Mac has already compiled this exact code, so the build should go through; it takes longer than build 1 because of the pose library.
3. Install it as in step 7 (scan the QR code, tap Install). It replaces build 1 and keeps the app's data. Developer Mode is already on.
4. Run `npm start` and open Tracker Dev as in step 8.

### Set up once

- Put the phone upright (portrait) on a stand at about hip height, side-on to where you'll stand, about 3 m away, facing the light. The skeleton is only drawn right with the phone upright in this spike. With nobody to film, a side-view squat video playing on a TV or monitor works too.
- For runs that measure battery and heat: unplug the phone, battery between 30% and 90%, Low Power Mode off, Auto-Brightness off (Settings → Accessibility → Display & Text Size, at the bottom) with brightness about half, a normal room temperature, and the phone in its usual case.
- Start each run with the phone cool. Wait about 15 minutes between runs.

### Run it

1. Profile → Developer → **Camera spike**. Allow the camera when iOS asks.
2. Tap **R0 Smoke test** (1 minute) with you or the video in view. Check the top panel:
   - The engine line names MediaPipe on the GPU.
   - "Overlay check: matches" (back camera). If it says "off by", open Settings at the bottom and try **Quarter turns** → Swapped; the line updates within a second.
   - The skeleton sits on the body. If the check matches but the skeleton is off or sideways, try **Points are** → Upright, then Buffer. If the skeleton is upside down, or the pose is rarely found, try **Engine sees** → Other turn.
   - Tell me which settings worked, if you changed any.
   - No red "Clock check failed" line.
3. Tap **Export** when R0 finishes, and save the file to iCloud Drive or OneDrive, or mail it to yourself.
4. Then the other runs, one per sitting, with the phone cool and settings as they were for R0. Export each one.
   - **R1 Engine sweep**, 12 minutes: every engine in turn.
   - **R2 Soak**, 30 minutes nonstop.
   - **R3 Real session**, about 28 minutes: ten 1-minute sets with the camera off between them.
   - **R4 Battery baseline**, 30 minutes with pose detection off.
5. **Live sets:** do 2-3 sets each of squats, split squats, RDLs, and standing and seated calf raises, side-on. Watch whether the heel and toe dots stay on your foot and the knee angle in the top panel looks right.
6. Put the exported files on the PC and tell me where they are. I'll read them and propose the targets.

The screen stays awake during a run. Closing it mid-run saves what it has, marked as stopped. Each run also saves itself every 30 seconds.

## When a new build is needed

Code changes reload from the PC as before, with no new build. A new build (step 6 again, then step 7) is only needed when a native package or a native setting changes: `app.json`, `app.config.ts`, `eas.json`, an app icon, or the native code in `client/modules/`. I'll say so whenever a change needs one. Before a build, a GitHub Mac compiles the native code for free (the "iOS compile check" on GitHub), so a build is only spent on code that compiles.
