# Bondoo — Android (Capacitor) Setup

This project is a TanStack Start SSR web app. To ship it on Google Play, we
wrap it with **Capacitor** so it runs as a native Android app that loads the
hosted Bondoo URL (`https://bondoo-connect.lovable.app`).

> ⚠️ Capacitor's native tooling (Android Studio, Gradle, JDK 17) can't run
> inside Lovable's sandbox. Do the steps below **locally on your machine**
> after you download / clone this project.

---

## 1. Prerequisites (one-time on your PC)

- **Node.js 20+** and **bun** (or npm/pnpm)
- **Android Studio** (Hedgehog or newer)
- **JDK 17** (installed automatically by Android Studio)
- Set env: `ANDROID_HOME` and add `platform-tools` to `PATH`

## 2. Install dependencies

```bash
bun install
```

Capacitor packages are already added in `package.json`:
`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
`@capacitor/app`, `@capacitor/status-bar`, `@capacitor/splash-screen`,
`@capacitor/haptics`.

## 3. Add the Android platform (first time only)

```bash
bunx cap add android
```

This creates an `android/` folder with a full Gradle project.

## 4. Generate app icon & splash from `resources/`

`resources/icon.png` (1024×1024) and `resources/splash.png` (2732×2732) are
committed. Regenerate all Android densities (mdpi → xxxhdpi + adaptive icon
+ splash) with the official Capacitor tool:

```bash
bun add -D @capacitor/assets
bunx capacitor-assets generate --android \
  --iconBackgroundColor '#FFF8F0' \
  --iconBackgroundColorDark '#FFF8F0' \
  --splashBackgroundColor '#FFF8F0' \
  --splashBackgroundColorDark '#FFF8F0'
```

This writes into:
- `android/app/src/main/res/mipmap-*/ic_launcher*.png` (legacy + round + adaptive)
- `android/app/src/main/res/drawable-*/splash.png`

Rerun this command whenever you change `resources/icon.png` or `resources/splash.png`.

## 5. Sync web config into Android

Whenever you change `capacitor.config.ts` or publish new web changes:

```bash
bunx cap sync android
```

Because `server.url` points at the hosted Bondoo URL, you do **not** need to
rebuild the web bundle — publish your app on Lovable and the Android wrapper
picks up the latest UI on next launch.

## 6. Open in Android Studio

```bash
bunx cap open android
```

In Android Studio:
- Wait for Gradle sync to finish.
- Click **Run ▶** to launch on an emulator or a connected device
  (USB debugging enabled).

## 7. Build a release AAB for Play Store

1. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.
2. Create (or reuse) an **upload keystore** — keep it safe, you need it for
   every future update.
3. Select **release** build variant → **Finish**.
4. Output: `android/app/build/outputs/bundle/release/app-release.aab`.

Upload that `.aab` file in **Google Play Console → Production → Create release**.

---

## Play Store checklist for Bondoo

Because Bondoo lets strangers meet in person, Play review is strict. Prepare:

- **Privacy policy URL** (required for social apps)
- **Data safety form** — declare: phone, email, photos, Gov-ID, chat, location
- **Account deletion flow** in-app + a web deletion URL
- **Age gating (18+)** at signup
- **In-app report + block** (already implemented ✓)
- **Content moderation policy** documented publicly
- **Target API level** = latest (Capacitor 8 targets API 34/35 by default)
- App icon 512×512 PNG, feature graphic 1024×500 PNG, min. 2 screenshots

---

## Updating the app later

- **UI/logic changes** → publish on Lovable. Users get updates instantly
  because the wrapper loads the hosted URL. No Play resubmit needed.
- **Native changes** (icons, splash, permissions, plugins, `capacitor.config.ts`)
  → bump `versionCode` in `android/app/build.gradle`, rebuild AAB, upload to Play.

## Switching to a fully offline (static) build later

If you outgrow SSR and want the web bundle packaged inside the APK:

1. Migrate the app to a static export (or a separate Vite SPA build).
2. Remove the `server.url` block from `capacitor.config.ts`.
3. Ensure `webDir` in `capacitor.config.ts` points at the static output folder.
4. Run `bun run build && bunx cap sync android` before every release.