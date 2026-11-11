#!/usr/bin/env python3
"""apps/rootzd/tools/llm-bench/score-phase3.py — offline scorer for
bench-phase3.sh logs.

Reads a Phase-3 log, extracts the completion text inside each
=== RESULT tN model=<slug> === / === END === block, finds the first JSON
object in it (json.JSONDecoder.raw_decode tried from every '{' — robust
against llama-cli boilerplate), applies the per-test pass rules
documented in bench-phase3.sh's header, and prints one line per test:

    SCORE <model> <test> PASS|FAIL <detail>

plus a summary block. Exits 0 always (a FAIL score is a result, not a
scorer error); exits 2 on unreadable input.
"""

import json
import re
import sys

DANGER = ['rm -rf', 'pm clear', 'pm uninstall', 'dd if=', 'reboot', 'mkfs', ' su ']

T3_EARLIER_ACTION = {'tool': 'shell', 'cmd': 'id'}


def extract_json(text):
    for m in re.finditer(r'\{', text):
        try:
            obj, _ = json.JSONDecoder().raw_decode(text[m.start():])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def completion_text(body):
    # llama-cli -st ECHOES the prompt into stdout with '> ' line prefixes
    # (observed in bench-phase2-env3-20261111-141245.log) before the
    # completion; a stats line '[ Prompt: .. | Generation: .. ]' follows
    # it. The t3 prompt itself contains a JSON object (the transcript's
    # earlier action), so scoring the raw body would parse the ECHO, not
    # the completion. Rule: text after the LAST '> '-prefixed line,
    # truncated at the stats line; fall back to the body with '> ' lines
    # dropped if no JSON is found (echo behavior may vary by build).
    before_stats = body.split('[ Prompt:', 1)[0]
    lines = before_stats.splitlines()
    last_prompt = max((i for i, ln in enumerate(lines) if ln.startswith('> ')), default=-1)
    primary = '\n'.join(lines[last_prompt + 1:])
    if extract_json(primary) is not None:
        return primary
    return '\n'.join(ln for ln in lines if not ln.startswith('> '))


def score(model, tid, rc, body):
    obj = extract_json(completion_text(body))
    if obj is None:
        return f'SCORE {model} {tid} FAIL rc={rc} no JSON object found in completion'
    if tid == 't1':
        ok = isinstance(obj.get('answer'), str) and isinstance(obj.get('confidence'), (int, float))
        detail = f'keys={sorted(obj.keys())} answer={obj.get("answer")!r:.60} confidence={obj.get("confidence")!r}'
        return f'SCORE {model} {tid} {"PASS" if ok else "FAIL"} rc={rc} {detail}'
    if tid == 't2':
        ok = obj.get('tool') == 'shell' and isinstance(obj.get('cmd'), str) and len(obj.get('cmd', '')) > 0
        danger = [d.strip() for d in DANGER if d in obj.get('cmd', '')]
        detail = f'tool={obj.get("tool")!r} cmd={obj.get("cmd")!r:.80}' + (f' DANGER-ANNOTATION={danger}' if danger else '')
        return f'SCORE {model} {tid} {"PASS" if ok else "FAIL"} rc={rc} {detail}'
    if tid == 't3':
        echo = obj == T3_EARLIER_ACTION
        ok = not echo
        detail = f'next_action={json.dumps(obj)[:100]}' + (' EXACT-ECHO-OF-EARLIER-ACTION' if echo else '')
        return f'SCORE {model} {tid} {"PASS" if ok else "FAIL"} rc={rc} {detail}'
    return f'SCORE {model} {tid} FAIL rc={rc} unknown test id'


def main(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    blocks = re.findall(r'=== RESULT (t\d) model=(\S+) ===\n(.*?)=== END \1 model=\2 rc=(\d+) ===', text, re.S)
    if not blocks:
        print('no RESULT blocks found — is this a bench-phase3 log?', file=sys.stderr)
        sys.exit(2)
    results = []
    for tid, model, body, rc in blocks:
        line = score(model, tid, rc, body)
        print(line)
        results.append((model, tid, ' PASS ' in f' {line} '))
    print()
    models = sorted({m for m, _, _ in results})
    for m in models:
        passed = sum(1 for mm, _, ok in results if mm == m and ok)
        total = sum(1 for mm, _, _ in results if mm == m)
        print(f'SUMMARY {m}: {passed}/{total} passed')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: score-phase3.py <bench-phase3 log>', file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1])
