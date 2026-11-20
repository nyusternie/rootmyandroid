#!/usr/bin/env node
/**
 * apps/android/tools/check-dead-controls.mjs — F-Droid gate 10 sweep
 * (docs/FDROID-CHECKLIST.md): "no <Pressable>/<TouchableOpacity> without
 * onPress unless disabled" (mezinster's recurring finding — twice on
 * sidecoin). Also checks our own button wrappers, whose onPress is
 * OPTIONAL, so a missing handler compiles clean and ships a tappable
 * control that does nothing.
 *
 * A wrapper is considered safe when the call site passes onPress OR a
 * `note` (the inert-state explanation the wrappers render) — the wrapper
 * then renders disabled + explains itself.
 *
 * Usage: node apps/android/tools/check-dead-controls.mjs [file.tsx ...] [--verbose]
 *        (defaults to App.tsx; pass paths for the negative self-test)
 * Exit:  0 = clean, 1 = dead control(s) found.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const FILES = args.filter((a) => !a.startsWith('--'));
if (FILES.length === 0) FILES.push('App.tsx');
const WRAPPERS = ['PrimaryButton', 'GhostButton', 'ToolRow'];
const verbose = process.argv.includes('--verbose');

/** Collect an element's full opening tag (multi-line safe). */
function tagAt(lines, start) {
  let tag = lines[start];
  for (let i = start; i < lines.length - 1 && !tag.includes('>'); i++) {
    tag += ` ${lines[i + 1].trim()}`;
  }
  return tag;
}

/** For wrapper call sites, the tag ends with '/>' rather than '>'. */
function callAt(lines, start) {
  let tag = lines[start];
  for (let i = start; i < lines.length - 1 && !tag.includes('/>'); i++) {
    tag += ` ${lines[i + 1].trim()}`;
  }
  return tag;
}

let dead = 0;
let checked = 0;

for (const file of FILES) {
  const path = resolve(ROOT, file);
  const lines = readFileSync(path, 'utf8').split('\n');

  lines.forEach((line, i) => {
    if (line.includes('<TouchableOpacity') || line.includes('<Pressable')) {
      const tag = tagAt(lines, i);
      checked++;
      if (!tag.includes('onPress') && !tag.includes('disabled')) {
        console.error(`DEAD  ${file}:${i + 1}  ${tag.trim().slice(0, 120)}`);
        dead++;
      } else if (verbose) {
        console.log(`ok    ${file}:${i + 1}`);
      }
    }

    for (const wrapper of WRAPPERS) {
      if (line.includes(`<${wrapper}`)) {
        const tag = callAt(lines, i);
        checked++;
        // A wrapper with no onPress renders inert; it MUST carry a note so
        // the user is told why the control does nothing.
        if (!tag.includes('onPress') && !tag.includes('note=')) {
          console.error(`DEAD  ${file}:${i + 1}  ${tag.trim().slice(0, 120)}`);
          dead++;
        } else if (verbose) {
          console.log(`ok    ${file}:${i + 1}`);
        }
      }
    }
  });
}

console.log(`gate 10: ${checked} controls checked, ${dead} dead`);
process.exit(dead === 0 ? 0 : 1);
