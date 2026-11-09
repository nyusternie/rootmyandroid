# HANDOFF — Web updates for the Rootz product line (Web team)

- **Date:** 2026-11-09
- **From:** agent session (rootz/rootzd/redfin workstream)
- **To:** `apps/web` maintainers
- **Status:** ready to pick up; item 1 was parked pending the APK product
  definition — that definition now EXISTS.

## 1. `/rootz` page copy pass (was parked — now unblocked)

HANDOFF.md §13 parked the `/rootz` page copy "pending the APK product
definition." The definition, per owner rulings 2026-11-08/09:

- **Rootz (the APK)** is the **no-wipe tier** product: privileged
  capabilities WITHOUT a bootloader unlock (the unlock wipes the device —
  redfin proved it — and the larger market won't accept that).
- Current shipped state: **MVP v26.11.8** — a thin client for the `rootzd`
  daemon bridge (127.0.0.1:7357), verified end-to-end on the redfin rig
  (RS-45). Versions are DATE-labeled (YY.M.D) going forward.
- **Rootz PRO** ($15/365 days) spans BOTH the APK and the daemon
  (2026-11-08 ruling) — Terminal Editor / Log Analysis attach to the
  daemon.
- Mascot: **Colonel Su** (visual canon unchanged).
- Package id: `com.rootmyandroid.rootz` (owned namespace, sideload-only,
  no Google Play listing).

Do NOT promise capabilities that don't exist yet (rule 3): v26.11.8
requires the daemon to be started externally (adb); in-app
wireless-debugging self-pairing is v-next (see §4 below — describe as
"in development" at most).

## 2. `/download`: add the Rootz APK section

- APK artifact: GitHub **rolling prerelease** `rootz-preview-apk`, asset
  `app-release.apk` (repo: nyusternie/rootmyandroid). Direct asset URL is
  stable-by-convention rolling-prerelease style:
  `https://github.com/nyusternie/rootmyandroid/releases/download/rootz-preview-apk/app-release.apk`
- DECISION for the web team: link the GitHub asset directly vs host a
  site copy. (Precedent: the existing `/download` page sideloads the
  edition APKs — check how it links those and mirror it.)
- The APK is **debug-signed** (preview-only pattern, same as the iOS
  preview shell) — the page should say so plainly (install warnings are
  expected), same as it does for the existing previews.
- Displayed version label: `26.11.8` (date scheme).

## 3. TWRP web presence: KEEP (owner ruling 2026-11-09) — NO ACTION

The `/TWRP` profile page and the device catalog's TWRP support-status /
download data STAY. They are customer-facing device facts; only the
pipeline/roadmap references were purged from agent tooling. Recorded here
so no one "cleans it up" later by mistake.

## 4. Coming soon — awareness only, no action yet

- **Rootz wireless-debugging self-pairing** (approved 2026-11-09, research
  spike done): the app will pair with the device's own Wireless Debugging
  over mDNS + TLS (AOSP `adb_wifi.md` architecture), then start `rootzd`
  itself — no computer needed. When it ships it will want a guide page.
  Implementation notes live with the rootz workstream until then.
- **boot.img library** (API team, see
  `docs/HANDOFF-2026-11-09-api-bootimg-library.md`): once live, the site
  will surface coverage metadata in the /scan flow and gated downloads.

## References

- `HANDOFF.md` §12/§13 (+ 2026-11-09 addendum 2)
- `apps/rootz/README.md` (MVP scope, roadmap)
- `apps/rootzd/README.md` (daemon, install paths)
- `.github/workflows/rootz.yml` (APK CI)
