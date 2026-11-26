<!-- docs/DECISION-2026-11-25-guardian-monitoring.md -->

# DECISION — Guardian Angel monitoring: what do we actually collect?

**For:** owner ruling
**From:** web/mobile workstream
**Date:** 2026-11-25
**Status:** OPEN — nothing is built until these four answers exist

## Why now

The app is now a working shell: it syncs to an account, the account lists
its devices on `/guardian`, protection and launcher-icon toggles work, and
the assistant sheet shows real state. **Nothing monitors anything yet.**

The public copy already promises more:

| plan | promised on `/pricing` | shipped today |
| --- | --- | --- |
| Guardian Angel Lite — $5 / 30 d | `read_apps` + `read_messages` | none |
| Guardian Angel Pro — $15 / 30 d | "the remaining monitoring features" | none |

Every option below is a product decision, not an engineering preference —
per repo rule 3 the agent does not invent what is collected, who reads it,
or how long it is kept.

## The four questions

1. **What is collected?**
   - a) installed-app inventory (package names) only;
   - b) a) + message *metadata* (sender, timestamp, count — never bodies);
   - c) a) + screen-time / unlock counts;
   - d) something else (owner specifies).

2. **How often, and where does it land?**
   - a) on-device only (the phone computes and shows; nothing leaves it);
   - b) account-scoped API snapshot (`POST /v1/device/audit` already exists
     with open-ended `audit_type` slugs — no API change needed for storage);
   - c) both (device keeps the raw data, the account gets a summary).

3. **Who can read it?**
   - the 16-digit account number is the only credential today. Anyone who
     has the number can read everything the account holds.
   - Options: (a) accept that (Mullvad model, the number is the secret);
     (b) add a separate "parent" credential; (c) device-side approval for
     each read (the Rootz CommandGuard pattern).

4. **Retention + transparency**
   - how long does the account keep snapshots (7 / 30 / 90 days / forever)?
   - what does the child see on the phone? (Today: the app is visible and
     the launcher toggle is user-controlled.)

## Constraints we already have

- **Android permissions.** `read_apps` needs `QUERY_ALL_PACKAGES` (Play
  policy-restricted, irrelevant for F-Droid/sideload) or the narrower
  `<queries>` set. Messages need `READ_SMS`/`RECEIVE_SMS` — Play's SMS
  policy forbids it for non-default-SMS apps; F-Droid allows it. The app is
  distributed via F-Droid/sideload, so both are technically possible, but
  Play submission later would be blocked.
- **Battery/OS.** Background collection on Android 14 needs a foreground
  service with a visible notification (we already run one in Rootz and know
  the pattern) — that notification is itself a transparency feature.
- **Privacy posture.** The site says "No email. No password." and the
  Guardian page says on-device settings stay on the device. Any collection
  that leaves the phone changes those statements and the `/guardian` copy.

## What I need from you

Answer 1–4 (one line each is enough). Then the build order I would follow:

1. **Lite slice**: installed-app inventory → `POST /v1/device/audit`
   (`audit_type: "guardian_apps"`), rendered on `/guardian` for the selected
   device. No new API route; the existing audit endpoints are open-ended.
2. **Pro slice**: whatever 1(b)/(c) turns out to be, behind the plan gate.
3. **Assistant**: the avatar's "Ask the Guardian…" field gets a real
   endpoint once there is data worth asking about.

Until then I will not add permission prompts, collectors, or new copy that
implies monitoring.
