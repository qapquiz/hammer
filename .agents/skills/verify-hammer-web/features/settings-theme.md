# Theme switcher

Settings offers a three-way theme switcher (`Dark` / `Light` / `System`, uniwind-powered). The
selected segment highlights, and the whole UI (background, tab bar, text colors) flips.

## Sub-features

- `theme-switch-dark` tapping `Dark` renders dark surfaces.
- `theme-switch-light` tapping `Light` renders light surfaces.
- `theme-highlight` the active segment shows `accessibilityState selected` and highlighted styling.

## How to get to it (user POV)

- Tabs: `Settings` — the switcher is the bordered segmented control below the `Cluster` card.

## Driving it with agent-browser

Preconditions:

- Instance healthy; app rendered; record the starting state:
  `agent-browser eval --stdin` with
  `({cls: document.documentElement.className, bg: getComputedStyle(document.body).backgroundColor})`.

- **Switch to Dark.** Click the `Dark` button ref on the Settings tab. Re-run the eval — expect
  `cls: "dark"` and `bg: "rgb(0, 0, 0)"`. Screenshot `theme-dark.png`.
- **Switch to Light.** Click `Light`; expect `cls: "light"` and `bg: "rgb(255, 255, 255)"`.
  Screenshot `theme-light.png`.
- **Assert selection.** `agent-browser snapshot -i -c` — the active theme button carries
  `[selected]`.
- **Proof.** Transcript with the before/after eval outputs + both screenshots; the className and
  computed background must agree with the pressed button.

## Gotchas

- Headless Chrome defaults to light, so `System` resolves to `light` — assert against the eval
  values, not assumptions about the default.
- Theme is applied via a class on `<html>`; checking only an inline style on one component misses
  regressions — always read `documentElement.className` plus body background together.
- The heroui `colorKit.RGB` console error tends to fire around theme re-renders; re-apply the
  LogBox neutralizer before further clicks (see `../SKILL.md`).
