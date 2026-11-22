# HANDOFF — F-Droid round 2, and five community reviews (2026-11-21)

Session state at close. Everything below was measured; nothing is assumed.

## 1. Our submission

**MR !58486** — https://gitlab.com/fdroid/fdroiddata/-/merge_requests/58486

| | |
|---|---|
| fork / project | `gitlab.com/nyusternie/fdroiddata`, project **89251913** |
| branch | `com.rootmyandroid` @ `bc957a32` |
| diff | exactly one file, `metadata/com.rootmyandroid.yml` |
| pipeline | `3098300035` — **9/9 green**, `fdroid build` + `check apk` included |
| proof | *"compared built binary to supplied reference binary successfully"* / *"supplied reference binary has allowed signer 1c59c433…"* |
| labels | `[]` — a non-member cannot set them; maintainers label at triage |
| release | `v26.11.28` → `13c3f95`, `app-fdroid-release.apk` 17,993,664 B, sha256 `954447cd…478e` |

`!58356` was closed by linsui on 2026-11-21 with "Merge Request template is
not followed"; `!58486` supersedes it and is the first MR that follows
`Default.md` verbatim (28/28 checklist items, all 9 headings).

Conversation on the MR: linsui asked *"Can you use jdk 21? See the template at
templates/build-react-native.yml"* (note 4292726192); the reply with the
measurement is note 4293152953.

## 2. The JDK 21 round — why it took three releases

`26.11.27` (recipe switched to the template sed) failed the byte comparison.
`26.11.28` (same sed **also applied in our CI**) passed.

The missing half: the sed recompiles `@react-native/gradle-plugin` at 21,
which changes the Gradle artifact-transform cache key. That key is compiled
into `libappmodules.so` as

```
.gradle-home/caches/9.4.1/transforms/<hash>/transformed/react-android-0.88.0-release/prefab/…/propsConversions.h
```

(184 chars, only the 32-char hash differs). Reference carried `23ffe694…`,
F-Droid `7db65e98…`; the string shift cascaded into 1,736 / 5,201 / 1,478
differing bytes across the three `.so`, plus `classes2.dex`
(`kotlin-tooling-metadata.json`: reference 17 vs F-Droid 21).

**The JDK version alone does not move that key** — 26.11.26 (JDK 17) and
26.11.27 (JDK 21) both produced `23ffe694…` on blackhost. The sed does.

**How it was proven without another release:** built `assembleFdroidRelease`
on blackhost with the sed, then compared the `.so` and `.dex` against
F-Droid's own built APK from the failed job's artifact. All three `.so` and
the transform key matched exactly; `classes2.dex` differed only because the
version bump changes `BuildConfig`.

Rules that follow:
1. Never change two inputs of a byte-reproducibility chain at once.
2. When a comparison fails, the failing artifact is usually still
   downloadable — prove the fix against it before tagging anything.
3. The CI build and the recipe must run the SAME transformation. The workflow
   step and the recipe `init:` sed are intentionally identical; keep them so.

## 3. CI incidents

- Run 44944675442 died on `No space left on device` — the runner could not
  write its own log at 96 % disk. Freed 2.05 G of `_work/_update` plus
  `pnpm store prune` (364 MB) → 4.2 G.
- The first rerun failed on a load-dependent jest timeout in
  `apps/android/__tests__/App.test.tsx` (default 5 s, measured 18.4 s). The
  test now carries an explicit 30 s timeout; the assertion is unchanged.

## 4. Community reviews posted (5)

All done the same way: the MR's **own** `fdroid build` artifact installed on
redfin (Pixel 5, Android 14), PCAPdroid capture started **before** launch for
`INTERNET` apps, official report template.

| MR | app | finding | note |
|---|---|---|---|
| !58155 | Vynody | `commit:` is a tag; v7a/x86_64 ship no `libflutter.so`/`libapp.so`; unpinned clones + `rustup stable` + unchecksummed tarballs | 4293289744 |
| !58184 | OpenInvest | `NonFreeNet` (markets.ft.com, lt.morningstar.com, query1.finance.yahoo.com); 77 MB fat APK | 4293331591 |
| !56063 | CheapCheap | `NonFreeNet` (Supabase account backend); `fonts.gstatic.com` contacted at launch | 4293356104 |
| !58347 | AoD | the light only renders with the battery exemption (`mViewVisibility` 0x8 → 0x0, `mHasSurface` false → true) | 4293456851 |
| !56044 | CarbonPanel | `TetheredNet` missing (client for a self-hosted server) | 4293456872 |

## 5. Review procedure — now documented

`.agents/skills/fdroid-review/SKILL.md` (+ a pointer in `AGENTS.md`).
Source of truth: https://gitlab.com/fdroid/wiki/-/wikis/Tips-for-fdroiddata-contributors/Reviewing-new-apps

The three rules that were learned the hard way:
1. Pool is `review-requested` + **fewest notes**; "no outside review" means no
   **non-maintainer** comment — check `projects/36528/members/all?query=<user>`.
2. `INTERNET` apps need a capture started before the app opens; `ss` samples
   and `strings` are not a network check.
3. The official template, not freeform prose.

## 6. Open items

- **VirusTotal not run** on any of the five APKs — the one template row still
  marked "not run".
- **Flutter UIs only partly exercised** (Vynody, OpenInvest, CheapCheap): they
  expose no accessibility tree headlessly, so deeper function coverage needs
  eyes on the screen.
- **MR !58486 waits on review.** If a maintainer asks for a change it will be
  a metadata edit on the same branch — no rebuild needed.
- `!58356` remains closed; do not reopen it.

## 7. Device hygiene (redfin)

Every test package was uninstalled at close; battery whitelist entry removed;
notification listener revoked; `accessibility_enabled` and
`enabled_accessibility_services` restored. PCAPdroid stays installed (it was
already present). No files left on `/sdcard`.
