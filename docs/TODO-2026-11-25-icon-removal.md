<!-- docs/TODO-2026-11-25-icon-removal.md -->

# TODO — remove the app icon from the drawer (Guardian Angel **and** Rootz)

**Requested by:** owner, 2026-11-25
**Status:** OPEN — blocked on one owner decision (§3), not on code

## 1. What exists today

**Guardian Angel — has it.** `LauncherIconModule.setLauncherIconVisible()`
(`apps/guardian-angel/android/app/src/main/java/com/rootmyandroid/guardian_angel/LauncherIconModule.kt`)
enables/disables the launcher **activity-alias** `.LauncherAlias`
(`AndroidManifest.xml:22`) with `PackageManager.setComponentEnabledSetting(…,
DONT_KILL_APP)`. The app keeps running; the icon leaves the launcher. It is
the "Launcher icon" switch in the app.

Limits of the alias approach, measured/known:

- the icon disappears from the launcher, but the app stays listed in
  **Settings → Apps** and can still be started with `adb shell am start`;
- some launchers cache the icon until they refresh;
- the app itself is NOT hidden or suspended — which is exactly what a
  monitoring/daemon app needs.

**Rootz — does not have it.** No alias toggle; the icon is always visible.

## 2. The "admin rights" part — what it does and does not buy

- **Device admin** (what Guardian already uses for uninstall protection via
  `GuardianAdminReceiver`) does **not** grant app hiding.
- **`DevicePolicyManager.setApplicationHidden(admin, packageName, true)`**
  is the API that removes an app from the launcher *and* the app list. The
  platform documents it as callable only by a **device owner or profile
  owner**. A plain device admin cannot call it.
- Consequence, and the reason this needs a decision: a hidden app **is
  stopped and cannot run**. Hiding Guardian Angel that way would kill the
  very monitoring it exists for; hiding Rootz that way would stop the relay
  daemon. So `setApplicationHidden` is the wrong tool for both of our apps,
  unless we deliberately want to disable one remotely.
- Device owner also unlocks: blocking uninstall
  (`setUninstallBlocked`), kiosk/lock-task mode, and hiding *other* apps.
  Getting it requires provisioning on a factory-reset device (ADB
  `dpm set-device-owner`, or QR/NFC managed provisioning) — an onboarding
  decision, not a code tweak.

## 3. Decision needed (owner)

Pick one, per app:

**A. Alias hiding only (recommended for both).** Icon leaves the drawer,
app keeps running, no admin/device-owner requirement, reversible from the
app. Guardian already ships it; Rootz needs the same alias + toggle.
Trade-off: the app remains visible in Settings → Apps.

**B. True hide via device owner.** Icon gone everywhere and the app is
suspended. Only sensible for "freeze this device's app" scenarios, not for
the app that must keep monitoring/relaying. Requires factory-reset
provisioning and an owner-run `dpm set-device-owner` step.

## 4. Work items if A (the likely path)

1. **Rootz**: add `.LauncherAlias` (activity-alias → MainActivity) and a
   `LauncherIcon` module mirroring Guardian's; add a "Launcher icon" card to
   the Rootz UI (same position as Guardian's); keep the relay daemon running
   while the alias is disabled.
2. **Guardian**: nothing to build; optionally surface the toggle in the new
   assistant sheet as a third row (it already shows the state).
3. **Both**: a documented way back — the app can be reopened via
   `adb shell am start -n <pkg>/.MainActivity`, from the Root My Android app,
   or by re-enabling the alias; verify the toggle survives a reboot.
4. **Both**: make sure the disable/enable path never kills the process
   (`DONT_KILL_APP` is already used by Guardian — keep it).

## 5. Acceptance (either path)

- icon absent from the launcher/drawer after toggling;
- the app's background work continues (Guardian: monitoring/device admin
  state intact; Rootz: relay tunnel stays up and the web Terminal still
  connects);
- toggle state persists across reboot;
- a documented way to bring the icon back without reinstalling.

## 6. Not verified here

`setApplicationHidden`'s device-owner requirement is the platform's
documented contract; we have not exercised it on redfin. Before committing
to path B, provision a test device as device owner and confirm the
suspension behaviour with our apps.
