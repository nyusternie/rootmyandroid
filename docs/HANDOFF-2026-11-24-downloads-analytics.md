# HANDOFF — /downloads per-APK click tracking (2026-11-24)

Request to the `rootmyandroid-admin` / `rootmyandroid-api` owners (sibling
repos; this agent only reads them — AGENTS.md rule 9). The web side is
implemented in `apps/web`; this document is the wire contract the admin
Analytics page can build against.

## What the page emits now

`apps/web/src/scripts/analytics.ts` sends `{type:'ev', name, detail, p}` to
`POST /v1/analytics/event` on the same origin. The APK buttons and the
modal emit six event names:

| Event name | Where it fires | `detail` |
| --- | --- | --- |
| `apk_download_click_rootmyandroid` | hero CTA + featured card | `rootmyandroid` |
| `apk_download_click_rootz` | Rootz card | `rootz` |
| `apk_download_click_guardian_angel` | Guardian Angel card | `guardian-angel` |
| `apk_sideload_modal_open` | modal opens after an APK button click | JSON `{"app":"<slug>"}` |
| `apk_sideload_cancel` | user cancels the modal | JSON `{"app":"<slug>"}` |
| `apk_sideload_continue` | modal "Continue to download" | JSON `{"app":"<slug>"}` |
| `download` | the Continue anchor's real navigation | `<app slug>/<file>`, e.g. `rootz/app-release.apk` |

Transition: events recorded before 2026-11-24T20:45Z carry the old
aggregate name `apk_download_click` with the slug in `detail`; from that
deploy onward the per-app names below are emitted.

The click event NAME carries the product. The admin's existing "Click
events" card groups by name
(`rootmyandroid-admin/src/lib/analytics.js:493-500`), so each app appears
as its own row with zero admin changes. The `detail` slug is kept for a
future per-app funnel.

`download` is deliberately the pre-existing event name: the dashboard
already renders a "top downloaded files" breakdown from
`name='download'` grouped by `detail`
(`rootmyandroid-admin/src/lib/analytics.js:502-506`), so per-APK download
counts appear there with no dashboard change.

## Server-side limits (verified)

`rootmyandroid-api/src/lib/analytics.js`:

- event name must match `/^[a-z0-9_.-]{1,60}$/` (line 503) — all six names pass;
- `detail` is truncated to **150** chars (line 525) — the longest emitted
  detail is `rootmyandroid/rootmyandroid-release.apk` (42 chars);
- client events land with `source='client'` and can never forge funnel
  steps (comment at line 500).

## Why the Continue anchor's name is static

`analytics.ts` binds `[data-rma-event]` once at module load (line 195) and
the delegated click listener returns early when an element carries
`data-rma-event` (line 211). `downloads.ts` therefore sets only
`data-rma-event-detail` at open time; `data-rma-event="download"` is
static in `apps/web/src/components/pages/Download.astro`. A runtime-added
event name would be recorded by neither path.

## Suggested admin additions (owner's call)

1. A 3-step funnel per app: `apk_download_click_<slug>` →
   `apk_sideload_modal_open` → `download`. The click names carry the slug;
   the modal events carry it as JSON `{"app":"<slug>"}`.
2. An optional "APK clicks" card grouped by `detail` (same query shape as
   the existing `download` breakdown) if the three name rows in "Click
   events" are not the desired presentation.
3. Keep `outbound` untouched: APK buttons no longer emit it (their
   `data-rma-event` suppresses the auto-tracker), so `outbound` counts drop
   by the APK clicks — expected, not a regression.

## Verification performed on the built page (blackhost, 2026-11-24)

```
apps/web/dist/downloads/index.html:
  2x data-rma-event="apk_download_click_rootmyandroid"
  1x data-rma-event="apk_download_click_rootz"
  1x data-rma-event="apk_download_click_guardian_angel"
  1x data-rma-event="download"
  2x data-apk-file="rootmyandroid-release.apk" (hero + featured card)
  1x data-apk-file="app-release.apk"
  1x data-apk-file="guardian-angel-release.apk"
```

APK links verified live (HTTP 200): `android-apk/rootmyandroid-release.apk`,
`rootz-preview-apk/app-release.apk`,
`guardian-angel-apk/guardian-angel-release.apk`.

## No API upgrade is required

The collector is already generic: any name matching `/^[a-z0-9_.-]{1,60}$/`
is stored with its detail (150-char cap). No new endpoint, table, or column
is needed for these five events.

## Where the admin page already reads them

- `rootmyandroid-admin/src/lib/analytics.js:493-506` — query [9] counts
  client events by name (the "Click events" card); query [10] groups
  `name='download'` by detail (the "Downloads" card).
- `rootmyandroid-admin/public/app.js:530-542` — `renderCountTable` renders
  both; `:1061` wires `tbl-downloads`.
- `rootmyandroid-admin/public/index.html:380-388` — the two card headings.

Result with zero admin changes: the "Click events" card lists the three
`apk_download_click_<slug>` rows (per-app click counts), and the
"Downloads" card lists `rootz/app-release.apk`,
`rootmyandroid/rootmyandroid-release.apk`,
`guardian-angel/guardian-angel-release.apk` with per-file counts. A
click → modal → download funnel needs a new query/card in the admin repo
only.
