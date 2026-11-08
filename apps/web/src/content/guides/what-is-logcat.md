---
title: What is logcat? Reading Android's system log
description: logcat is Android's built-in diagnostic log. What it records, what the columns mean, and how to read it on your phone or over ADB.
published: 2026-11-08
updated: 2026-11-08
order: 3
---

Every Android device keeps a running diagnostic diary called **logcat**:
system components and apps write short, timestamped messages into it, and
reading those messages is the fastest way to understand why something on
your phone is misbehaving.

## What a logcat line tells you

A typical line looks like this (illustrative example):

```
10-08 09:15:23.456  1623  1701 I ActivityManager: Start proc com.example.app
```

- **Timestamp** — when the message was written.
- **Process / thread IDs** — which process wrote it.
- **Priority letter** — how severe the message is (see below).
- **Tag** — who is speaking; conventionally the component or app name.
- **Message** — what happened.

## Priority levels, from quietest to loudest

- **V — Verbose**: chatty detail, usually only useful to developers.
- **D — Debug**: diagnostic detail.
- **I — Info**: normal, noteworthy events.
- **W — Warning**: something unexpected, but not fatal.
- **E — Error**: something failed.
- **F — Fatal**: a crash-level failure.

When you are hunting a problem, filtering to **W** and above cuts almost
all of the noise.

## How to read it

- **On the phone:** the free Rootz toolbox includes a logcat reader — no
  computer needed.
- **From a computer:** with developer options and USB debugging enabled,
  `adb logcat` streams the log live. Useful variations:
  - `adb logcat -d` — dump the current buffer once and exit.
  - `adb logcat *:E` — only error-level (and above) messages.
  - `adb logcat -b crash` — the crash buffer: just the crash records.

## What it is good for

- Finding out **why an app crashes** or refuses to start.
- Diagnosing **boot loops** and system errors.
- Seeing **permission denials** and background restrictions in action.
- Feeding **Rootz Pro Log Analysis**, which reads the noise for you — and,
  as our AI assistance rolls out, explaining what it found in plain
  language.

## One caution before sharing logs

Logcat can contain whatever an app's developer chose to write into it —
including things like account names or network addresses. Skim a log before
you send it to anyone.

Further reading: the official
[logcat documentation](https://developer.android.com/tools/logcat) at
developer.android.com.
