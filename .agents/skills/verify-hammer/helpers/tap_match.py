#!/usr/bin/env python3
"""Find a clickable element by accessible label in a uiautomator dump.

Usage: tap_match.py QUERY DUMP.xml
Prints "CX CY label..." or exits 1 with candidates on stderr.
Matching (clickable nodes only): substring of content-desc or contained text; among matches the
LARGEST bounds wins — the enclosing row/card/Pressable is the real touch target in React Native,
while small a11y virtual leaves (even with an exact desc) can swallow taps without firing
handlers. Zero-bounds nodes are skipped (Compose-hosted popovers report none).
"""
import re
import sys
import xml.etree.ElementTree as ET

query = sys.argv[1]
root = ET.parse(sys.argv[2]).getroot()

clickables = []  # (bounds_tuple, desc, node)

def walk(node):
    if node.get('clickable') == 'true' and node.get('bounds'):
        clickables.append((node.get('bounds'), node.get('content-desc') or '', node))
    for child in node:
        walk(child)

walk(root)

def parse_bounds(b):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b or '')
    return tuple(map(int, m.groups())) if m else None

def texts_of(node):
    return [n.get('text') for n in node.iter() if n.get('text')]

best = None  # (priority, area, cx, cy, label)
for bounds, desc, node in clickables:
    b = parse_bounds(bounds)
    if not b:
        continue
    x1, y1, x2, y2 = b
    area = (x2 - x1) * (y2 - y1)
    if area <= 0:
        continue  # degenerate compressed-dump node — never a real tap target
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    texts = texts_of(node)
    if desc == query:
        prio = 0
    elif query in desc:
        prio = 1
    elif query in texts:
        prio = 2
    else:
        continue
    cand = (area, prio, cx, cy, f'desc={desc!r} texts={texts!r} bounds={bounds}')
    if best is None or (cand[0], -cand[1]) > (best[0], -best[1]):
        best = cand

if best is None:
    print(f"NO MATCH for {query!r}", file=sys.stderr)
    labels = [d or (texts_of(n) or ['?'])[0] for _, d, n in clickables]
    print('clickable elements on screen: ' + ', '.join(repr(l) for l in labels), file=sys.stderr)
    sys.exit(1)
print(best[2], best[3], best[4])
