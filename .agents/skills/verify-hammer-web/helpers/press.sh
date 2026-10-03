#!/usr/bin/env bash
# press.sh "<visible text>" — press an RN-web pressable through agent-browser.
#
# Why: in this environment agent-browser's CDP clicks never reach react-native-web
# Pressable handlers (no pointer/mouse/click events arrive at the target), and its
# XPath resolver misses elements that exist ("✓ Done" clicks that land nowhere).
# A synthetic pointer burst (pointerdown → mousedown → pointerup → mouseup → click
# dispatched on document.elementFromPoint at the element center) does reach them.
# react-aria-based heroui Select ITEMS ignore even synthetic (untrusted) events —
# for those, drive the equivalent Settings-screen rows instead (see features/).
#
# Usage: AGENT_BROWSER_SESSION=<session> press.sh "<text contained in the control>"
# Matches visible div[role=button], button, [role=tab], and a elements; prefers the
# smallest (innermost) match; scrolls into view first. Prints "pressed: <label>" or
# "NO MATCH: <text>" and exits 1 on no match.
set -eu
TEXT=$1
JS=$(TEXT=$TEXT python3 - <<'PY'
import json, os
print("""
(() => {
  const needle = %s;
  const match = [...document.querySelectorAll('div[role=button],button,[role=tab],a')]
    .filter(x => x.offsetParent !== null && ((x.innerText || '') + (x.value || '')).includes(needle));
  if (!match.length) return 'NO MATCH: ' + needle;
  match.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  });
  const el = match[0];
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse',
              isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 };
  const t = document.elementFromPoint(x, y) || el;
  t.dispatchEvent(new PointerEvent('pointerdown', o));
  t.dispatchEvent(new MouseEvent('mousedown', o));
  t.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
  t.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
  t.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  return 'pressed: ' + ((el.innerText || el.value || '').trim().slice(0, 48)) + ' @' + Math.round(x) + ',' + Math.round(y);
})()
""" % json.dumps(os.environ['TEXT']))
PY
)
RESULT=$(agent-browser eval --stdin <<<"$JS")
echo "$RESULT"
case "$RESULT" in
  *NO_MATCH*|*'"NO MATCH'*|*NO\ MATCH*) exit 1 ;;
esac
