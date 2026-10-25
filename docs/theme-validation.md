# Theme validation

**Generated:** 2026-10-24, from the token values in `dashboard/src/app.css` and `dashboard/src/themes/*.css`.
**Checked by:** `dashboard/tests/unit/theme-contrast.test.ts` (WCAG contrast, on every test run) and, for the burndown
series, the dataviz palette validator (`validate_palette.js --mode <mode> --surface <surface>`).

## Targets

| What | Themes | High contrast |
|---|---|---|
| Text and muted text, on every surface (bg, surface, surface2) | 4.5:1 (WCAG AA) | 7:1 (AAA) |
| Text on the filter count badges (a 15% text tint) | 4.5:1 | 7:1 |
| Coloured labels: type/status/phase colours on their 15% tint and on the surface | 3:1 | 4.5:1 |
| Text on accent buttons (`--on-accent` on `--accent`) | 4.5:1 | 7:1 |
| Burndown lines against the surface (WCAG 1.4.11, graphical objects) | 3:1 | 3:1 |

Coloured labels are held to 3:1 rather than 4.5:1: they are short, semi-bold labels that always come with text
(type and status names), and 4.5:1 would rule out GitHub's own palette, which the Default theme uses unchanged
(its light-mode label colours measure 3.8–4.0:1 on their tints). High contrast meets 4.5:1 for them.

Where a theme's published colour missed a target, it was moved the minimum amount toward lighter (dark modes) or
darker (light modes) until it passed; each change is listed as a comment above the block in the theme file and
below.

## Results (lowest ratio in each group)

| Theme | Mode | Text | Muted | Count badge | Labels (worst) | On accent | Burndown lines |
|---|---|---|---|---|---|---|---|
| Default | dark | 12.9 | 5.6 | 9.7 | 4.4 (red) | 8.3 | 4.5 |
| Default | light | 13.5 | 5.7 | 11.1 | 3.8 (yellow) | 5.2 | 4.7 |
| Nord | dark | 7.5 | 7.4 | 5.8 | 3.1 (red) | 6.2 | 3.1 |
| Nord | light | 9.2 | 6.1 | 7.9 | 3.1 (yellow) | 4.6 | 3.7 |
| Solarized | dark | 5.2 | 4.6 | 4.6 | 3.1 (accent) | 4.6 | 3.5 |
| Solarized | light | 5.1 | 4.6 | 4.7 | 3.1 (red) | 4.6 | 3.8 |
| Catppuccin | dark | 8.7 | 7.4 | 7.7 | 5.4 (red) | 7.8 | 4.2 |
| Catppuccin | light | 6.0 | 4.7 | 5.3 | 3.1 (orange) | 4.6 | 3.1 |
| Tokyo Night | dark | 8.3 | 8.1 | 7.5 | 4.1 (pink) | 7.1 | 4.5 |
| Tokyo Night | light | 4.7 | 4.7 | 4.6 | 3.1 (purple) | 4.6 | 3.3 |
| Ayu | dark | 8.5 | 4.6 | 7.3 | 4.1 (red) | 10.1 | 4.7 |
| Ayu | light | 5.2 | 4.5 | 5.0 | 3.0 (yellow) | 5.6 | 3.7 |
| Night Owl | dark | 11.0 | 4.5 | 9.5 | 4.6 (red) | 8.0 | 4.7 |
| Night Owl | light | 8.7 | 4.5 | 7.7 | 3.0 (orange) | 5.5 | 3.6 |
| Gruvbox | dark | 8.5 | 5.3 | 7.2 | 3.0 (purple) | 6.1 | 3.8 |
| Gruvbox | light | 8.5 | 4.6 | 7.9 | 3.0 (yellow) | 5.8 | 3.3 |
| High contrast | dark | 17.0 | 15.9 | 13.4 | 5.9 (red) | 11.6 | 5.1 |
| High contrast | light | 18.4 | 15.1 | 14.9 | 5.3 (green) | 8.4 | 5.2 |

## Adjustments from the published palettes

**Nord, dark**:
- red: #bf616a -> #d18d94 (label contrast)
- purple: #b48ead -> #b995b2 (label contrast)
- pink: #c8879f -> #cb8ea5 (label contrast)
- orange: #d08770 -> #d38e79 (label contrast)
- burndown series #5b9bd5/#e06c3c: WCAG 3:1 against the surface (SC 1.4.11) wins over the chart validator's lightness band, which the blue exceeds slightly (0.671); all other validator checks pass */

**Nord, light**:
- accent: #5e81ac -> #5879a2 (label contrast)
- green: #a3be8c -> #6c7d5c (label contrast)
- yellow: #ebcb8b -> #887651 (label contrast)
- red: #bf616a -> #b45b64 (label contrast)
- purple: #b48ead -> #8c6f87 (label contrast)
- pink: #c8879f -> #9c697c (label contrast)
- orange: #d08770 -> #a26957 (label contrast)
- cyan: #8fbcbb -> #5e7c7b (label contrast)
- on-accent: #eceff4 -> #040405 (text on accent)
- burndown series #3d6fb0/#c0582f: Frost/Aurora read as gray to the chart validator (chroma floor) */

**Solarized, dark**:
- text: #93a1a1 -> #a9b4b4 (text contrast)
- text-muted: #839496 -> #8d9d9e (muted text contrast)
- accent: #268bd2 -> #2f90d4 (label contrast)
- red: #dc322f -> #e25350 (label contrast)
- purple: #6c71c4 -> #7e82cb (label contrast)
- pink: #d33682 -> #d95293 (label contrast)
- orange: #cb4b16 -> #d26437 (label contrast)
- on-accent: #fdf6e3 -> #002630 (text on accent) */

**Solarized, light**:
- text: #586e75 -> #4a5c62 (text contrast)
- text-muted: #657b83 -> #576a71 (muted text contrast)
- accent: #268bd2 -> #217ab9 (label contrast)
- green: #859900 -> #6d7d00 (label contrast)
- yellow: #b58900 -> #947000 (label contrast)
- purple: #6c71c4 -> #6a6fc0 (label contrast)
- pink: #d33682 -> #cf357f (label contrast)
- cyan: #2aa198 -> #22847d (label contrast)
- accent: #217ab9 -> #2075b2 (text on accent) */

**Catppuccin, dark**:
- burndown series #3987e5/#d95926 (the Default dark pair): the pastel blue/peach are too light for the chart validator's lightness band */

**Catppuccin, light**:
- text-muted: #6c6f85 -> #63667a (muted text contrast)
- green: #40a02b -> #368624 (label contrast)
- yellow: #df8e1d -> #a56915 (label contrast)
- pink: #ea76cb -> #ad5796 (label contrast)
- orange: #fe640b -> #cb5009 (label contrast)
- cyan: #179299 -> #15838a (label contrast)
- accent: #1e66f5 -> #1d62eb (text on accent)
- burndown series #1a5ad8/#e0580a: blue/peach darkened 12% for 3:1 against the surface */

**Tokyo Night, dark**:
- burndown series #6482c6/#cb7f54: blue/orange shifted 22% toward the background for the chart validator's lightness band */

**Tokyo Night, light**:
- text: #3760bf -> #3256ac (text contrast)
- text-muted: #6172b0 -> #55649b (muted text contrast)
- accent: #2e7de9 -> #2b76db (label contrast)
- red: #f52a65 -> #dc265b (label contrast)
- purple: #9854f1 -> #9552ec (label contrast)
- on-accent: #e1e2e7 -> #03050a (text on accent) */

**Ayu, dark**:
- text-muted: #5a6673 -> #76808b (muted text contrast)
- burndown series #3987e5/#d95926 (the Default dark pair)

**Ayu, light**:
- text-muted: #8a9199 -> #70757c (muted text contrast)
- accent: #ffaa33 -> #b57924 (label contrast)
- green: #6cbf43 -> #549534 (label contrast)
- yellow: #e7a100 -> #b27c00 (label contrast)
- purple: #a176cb -> #9e74c7 (label contrast)
- pink: #f07171 -> #d36363 (label contrast)
- orange: #fa8532 -> #cb6c29 (label contrast)
- cyan: #4abc96 -> #3a9577 (label contrast)
- on-accent: #fcfcfc -> #03050a (text on accent)
- burndown series #1a5ad8/#e0580a (the Catppuccin light pair)

**Night Owl, dark**:
- text-muted: #637777 -> #6f8282 (muted text contrast)
- burndown series #3987e5/#d95926 (the Default dark pair)

**Night Owl, light** (Light Owl has no orange; Night Owl's is used):
- text-muted: #989fb1 -> #6f7481 (muted text contrast)
- accent: #288ed7 -> #278ad1 (label contrast)
- yellow: #e0af02 -> #a48001 (label contrast)
- orange: #f78c6c -> #c36f55 (label contrast)
- cyan: #2aa298 -> #26938a (label contrast)
- on-accent: #ffffff -> #03050a (text on accent)
- burndown series #1a5ad8/#e0580a (the Catppuccin light pair)

**Gruvbox, dark**:
- purple: #b16286 -> #b36588 (label contrast)
- burndown series #3987e5/#d95926 (the Default dark pair)

**Gruvbox, light**:
- text-muted: #7c6f64 -> #776b60 (muted text contrast)
- yellow: #b57614 -> #ae7113 (label contrast)
- burndown series #1a5ad8/#e0580a (the Catppuccin light pair)

**High contrast, dark**:
- burndown series #3987e5/#d95926 (the Default dark pair): brighter lines fail the chart validator's lightness band */

**High contrast, light**:
- burndown series #064cad/#b24f06: lightened slightly for the chart validator's lightness band */

## Burndown series (dataviz palette validator)

All pairs pass the validator's checks (lightness band, chroma floor, colour-blind separation, normal-vision floor,
contrast) against their theme's surface, with one exception: Nord dark's blue (#5b9bd5) is slightly above the
lightness band (0.671). On Nord's comparatively light dark surface no blue/orange pair meets both the band and
WCAG's 3:1 for graphical objects, and the WCAG requirement wins. Its colour-blind separation still passes
(ΔE 21.3 protan).

## Size

Each theme adds about 1.2 KB to the built dashboard, which is held to 256 KB (guardrails.spec.ts).
