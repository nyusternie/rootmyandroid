# Policy — what may be checked, what may never be asserted

Two documents govern: the
[Inclusion Policy](https://f-droid.org/docs/Inclusion_Policy/) and the wiki's
Tester Review list. Both are re-read every round; this file is the distilled
checklist plus the precedents that cost us a retracted claim.

## Rule zero — no verdicts

The reviewer supplies evidence; the maintainer decides the label. Never write
"`NonFreeNet` matches the code", "`TetheredNet` is missing", "the label is
correct", or any sentence whose subject is an anti-feature and whose verb is a
judgement.

**Precedent (2026-11-22):** we wrote "`TetheredNet` missing (client for a
self-hosted server)" on !56044 CarbonPanel. linsui, note 4294629299: *"Thanks!
TetheredNet doesn't apply to self-host servers."* The claim was retracted by
the maintainer. Any user-configured / self-hosted endpoint is not, by itself,
a `NonFreeNet`/`TetheredNet` finding.

What to write instead: the observed hosts, the code path that reaches them,
and whether the store description documents them. Stop there.

## Inclusion Policy checklist (verified points)

Fetch it: `curl -sL https://f-droid.org/docs/Inclusion_Policy/`

- **FLOSS licence** — recipe `License:` plus a `LICENSE` file upstream.
- **No proprietary tracking / advertising / analytics SDKs** — the dex strings
  scan; quote matched symbols, never a bare count.
- **Build transparency** — the pipeline's `fdroid build` line
  `compared built binary to supplied reference binary successfully` and
  `supplied reference binary has allowed signer <hash>` matching
  `AllowedAPKSigningKeys`.
- **No executable downloads without consent** — no self-update code, no
  downloaded add-ons; updates come from the recipe's `AutoUpdateMode`.
- **Anti-Features are warning labels**, not disqualifiers; the author declares
  them and the maintainer adjudicates.
- **Quality Control** — functional, implements the described features, unique
  value. The 3-month development rule has exceptions, including "the author
  has been maintaining other apps on F-Droid"; that exception is argued in the
  MR description and decided by maintainers, never by the reviewer.

## Categories

Valid values live in fdroiddata `config/categories.yml`:

```bash
glab api "projects/36528/repository/files/config%2Fcategories.yml/raw?ref=master" > /tmp/cats.yml
grep -nE "^[A-Za-z][A-Za-z ]*:$" /tmp/cats.yml     # keys are at column 0
```

Quote the category's own description in the report when confirming it fits.

## Permissions

- `MANAGE_EXTERNAL_STORAGE` — must be absent or justified; SAF is the
  suggested alternative.
- Optional runtime permissions must be requested **on use**, and a refusal must
  degrade gracefully. Record the dialog text and the fallback text.
- Permissions merged in from libraries (androidx.work ⇒ `FOREGROUND_SERVICE`,
  `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`; androidx.biometric ⇒
  `USE_BIOMETRIC`, `USE_FINGERPRINT`) are explained by naming the library and
  the feature that schedules the work — verify the enqueue sites, do not
  assume they serve only one feature.

## Security scan (VirusTotal)

Run `tools/virustotal.sh <apk>` before writing the row. The key lives only on
blackhost (`/root/.virustotal/api-key`) and apecsdev
(`~/.config/virustotal/api_key`) per AGENTS rule 11; the tool calls the API on
the store host so the secret never reaches the workstation.

- `malicious` / `suspicious` — detections. Any non-zero value needs an
explanation in the report, not silence.
- `harmless` — engines that returned an explicit clean verdict.
- `undetected` — engines with **no verdict**. Not the same as clean; say
"undetected" when you mean it.
- `404` — the hash is unknown to VirusTotal (no report). Report it as such.
- Free-tier quota is small; a `429` is a rate limit, not a rejection. Wait and
retry rather than dropping the row.
- Uploading a sample is a privacy decision and is never automatic; ask the
owner first.

## Network

- Start the capture before launch; filter by the app label; `No matches` is a
  finding.
- If **no** connection is observed, the wiki requires asking the author whether
  `INTERNET` can be removed. Ask it as a question, not a demand.
- Undescribed connections are a question to the author, not a policy finding.
- `usesCleartextTraffic="true"` is informational (`application_attribution`);
  cite the consent gate or the manifest comment, and state whether any
  cleartext traffic was actually observed.
