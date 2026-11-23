# Report template (verbatim from the wiki) + filling rules

The block below is the **official template**, copied byte-for-byte from
<https://gitlab.com/fdroid/wiki/-/wikis/Tips-for-fdroiddata-contributors/Reviewing-new-apps>
(fetched 2026-11-23). Do not modernise it, do not swap it for a markdown table:
the wiki's HTML form is the current one and renders correctly in GitLab.

Filling rules:

- Every row is answered. `[x]` only for what you verified; leave `[ ]` and say
  why (not observed, not run, not reachable).
- Under each row, one bullet per claim, each carrying a `file:line`, a capture
  entry, or a job-trace line.
- Name the exact APK you installed (path inside the artifact + cert SHA-256)
  and the device (model, Android version).
- Close with a "Not reachable in this session" line listing the described
  functions you could not exercise and what they need.
- No meta-commentary: never mention your process, your earlier comment, or a
  previous version of the review.

## Template

<table>
<thead>
<tr>
<th>Category</th>
<th>Checklist</th>
</tr>
</thead>
<tbody>
<tr>
<td>Basic Function</td>
<td>

- [ ] The app can start and work normally.
- [ ] The functions in the description are implemented.
- [ ] The app has a unique icon (instead of a default one).

</td>
</tr>
<tr>
<td>Policy Compliance</td>
<td>

- [ ] Features don't violate F-Droid's Inclusion Policy.
- [ ] The Categories field is set properly.
- [ ] Doesn't require accepting any terms other than the FOSS license.

</td>
</tr>
<tr>
<td>Permissions<br>(Whether the app requires unnecessary permissions. Permissions are listed in Code Quality.)</td>
<td>

- [ ] The app can be used without granting optional runtime permissions. The app should only require necessary runtime permissions for basic functions on start and other runtime permissions should be required when corresponding functions are used. For example, a messaging app should only require CAMERA permission when the user starts a video chat.
- [ ] The app doesn't require unnecessary MANAGE_EXTERNAL_STORAGE permission. If it does, suggest using SAF instead when it's possible.

</td>
</tr>
<tr>
<td>Network Connections<br>(If the app requires <code>INTERNET</code> permission then the network connections need to be checked with network monitors, e.g. <a href="https://f-droid.org/en/packages/com.emanuelef.remote_capture">PCAPdroid</a>. Start the monitor before opening the app to make sure all the network connections are catched.)</td>
<td>

- [ ] Network connection is observed. If not, please ask the author to remove the permission.
- [ ] The app connects to web services on start. Such connections means NonFreeNet and TetheredNet may apply.
- [ ] The app checks for update automatically.
- [ ] The app has unnecessary connections, e.g., online fonts, icons, connectivity check, etc. Such connections should be removed or made optional.
- [ ] Tracking domains connected.
- [ ] Connections not described clearly in description. Such connections should be checked with the author.
- [ ] Unnecessary in-app webview (e.g. for author page) presents in the app. Such thing should be replaced with opening the url in browsers.

</td>
</tr>
<tr>
<td>Language Support</td>
<td>

- [ ] The app has English support. If English is not supported this should be declared in the description.

</td>
</tr>
<tr>
<td>Security Scan</td>
<td>

- [ ] All or most vendors on VirusTotal or similar scanning services indicate the app is benign.

</td>
</tr>
</tbody>
</table>

## Filled reference

Two complete reports produced with this template (2026-11-23):

- `rounds/2026-11-23.md` — Usuals (`io.theficos.usuals`) and Spunto
  (`io.theficos.spunto`), both with the evidence style this suite expects.
