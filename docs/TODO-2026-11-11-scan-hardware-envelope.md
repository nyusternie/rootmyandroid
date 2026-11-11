<!-- docs/TODO-2026-11-11-scan-hardware-envelope.md -->

# TODO — /scan hardware-envelope detectors (TOP PRIORITY)

Owner ruling 2026-11-11: bring the full hardware-envelope analysis
(performed over adb on redfin, Pixel 5, Android 14, 2026-11-11) into the
/scan product.

**Verified 2026-11-11:** EVERY fact in the envelope is readable by the adb
shell user (uid 2000) — the same context a WebUSB ADB client gets in the
browser (`@yume-chan/adb`) — EXCEPT the root-only items listed at the
bottom. Every command below is read-only inspection → inside the /scan
binding rules (AGENTS.md §"ADB / device analysis direction"). The only
su-gated commands in the 2026-11-11 session were the AICore data-dir
checks.

## Detector table (fact → shell command → parser input)

| Fact | Command(s) (uid 2000, read-only) |
| --- | --- |
| SoC / hardware id | `getprop ro.hardware ro.product.model ro.product.device`; `/proc/cpuinfo` "Hardware" |
| CPU topology + clocks | `/proc/cpuinfo` (CPU part counts); `/sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq` |
| ISA features (asimddp …) | `/proc/cpuinfo` "Features" |
| RAM | `/proc/meminfo` (MemTotal, MemAvailable) |
| GPU class + compute APIs | `getprop ro.hardware.egl`; presence of `/vendor/lib64/vulkan.adreno.so`, `libOpenCL*.so` |
| DSP presence | `/dev/adsprpc-smd`; `/vendor/lib64/libcdsprpc.so` |
| Kernel / OS / ABI | `uname -r`; `getprop ro.build.version.release ro.build.version.sdk ro.product.cpu.abi` |
| Storage | `df /data` |
| Thermal state | `dumpsys thermalservice` |
| Battery / charging | `dumpsys battery` |
| AI-relevant packages | `pm list packages` (e.g. `com.google.android.aicore` presence) |

## Implementation (existing /scan architecture)

- The outputs captured from redfin on 2026-11-11 become the FIRST device
  fixtures, named per repo pattern (model + capture date, e.g.
  `redfin-cpuinfo-2026-11-11.txt`) under `apps/web/src/lib/fixtures/`.
- Parsing/detection logic = pure fixture-tested functions in
  `apps/web/src/lib/`; unknown values render "unknown" (repo rule 3 — no
  guessing device behavior).

## Excluded from free /scan (root-only — uid 2000 cannot read)

- `/data/data/<pkg>/…` contents (e.g. AICore on-disk weights check).
- Any other su-gated path — those belong to the Rootz/rootzd lane, not
  the free WebUSB scan.
