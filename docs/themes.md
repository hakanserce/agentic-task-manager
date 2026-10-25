# More themes: the top 20 VS Code colour themes

The dashboard has six themes (Default, Nord, Solarized, Catppuccin, Tokyo Night, High contrast). This picks the top
twenty from the VS Code Marketplace (T-147); of those, **five are added** (see [Decision](#decision)), in two batches
(T-148, T-149), with a menu that works for 11 themes (T-152).

## Decision

Asked on 2026-10-25 (the open questions below):
- **No dark-only themes.** Every dashboard theme has a light and a dark variant; a derived light variant wouldn't be
  the theme people know. That also settles the size: five themes take about 6 KB, which the 256 KiB budget had (it was raised to 320 KiB afterwards, on 2026-10-25).
- **No near-duplicates.** Atom One is dropped (its dark variant is One Dark Pro's palette), Winter is Coming too
  (its dark variant shares Night Owl's background and most accents), and GitHub (the Default theme is already
  GitHub's palette).

| Batch | Themes |
|---|---|
| 1 (T-148) | Ayu, Night Owl, Gruvbox |
| 2 (T-149) | Noctis (Noctis + Lux), Sublime Material |

The dark-only themes in the tables below stay documented, in case the decision changes.

## How they were chosen

- **Source:** the Marketplace search API (`POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery`),
  VS Code extensions in the Themes category, sorted by install count; checked **2026-10-24**.
- **Left out:** icon themes, extensions that aren't colour themes, themes that come with a language pack
  (`ms-vscode.cpptools-themes`), and the four the dashboard already has.
- **Licence:** each theme's repository licence, checked against the LICENSE in its package. Only themes whose licence
  allows reusing the palette are used:
  - Material Theme (Equinusocio, no licence)
  - Monokai Pro (commercial)
  - Bearded Theme (GPL-3.0; this project is MIT, so treated as excluded)
  - Panda (no licence)
- **Near-duplicates:** "Theme" by tal7aouy is a clone of One Dark Pro with the same palette, so it is replaced by the
  next one, Darcula. One Dark Pro, Atom One Dark and One Monokai are close too; they stay, as different enough in use.
- **Colours:** taken from the theme JSON in each published package (several repos generate theirs at build time).
  The accents follow each theme's terminal colours, else its syntax colours.

## The twenty

| # | Theme | Marketplace ID | Installs | Licence | Variants | Batch |
|---|---|---|---|---|---|---|
| 1 | GitHub | GitHub.github-vscode-theme | 20.5 M | MIT | light + dark | 1 |
| 2 | One Dark Pro | zhuangtongfa.Material-theme | 12.9 M | MIT | dark | 1 |
| 3 | Dracula | dracula-theme.theme-dracula | 11.1 M | MIT | dark | 1 |
| 4 | Atom One (Dark + Light) | akamud.vscode-theme-onedark / -onelight | 7.4 M + 1.5 M | MIT | light + dark | 1 |
| 5 | Ayu | teabyii.ayu | 4.2 M | MIT | light + dark | 1 |
| 6 | Winter is Coming | johnpapa.winteriscoming | 3.8 M | MIT | light + dark | 2 |
| 7 | Night Owl | sdras.night-owl | 3.6 M | MIT | light + dark | 2 |
| 8 | One Monokai | azemoh.one-monokai | 3.0 M | MIT | dark | 2 |
| 9 | Palenight | whizkydee.material-palenight-theme | 2.7 M | MIT | dark | 2 |
| 10 | SynthWave '84 | RobbOwen.synthwave-vscode | 2.6 M | MIT | dark | 2 |
| 11 | Shades of Purple | ahmadawais.shades-of-purple | 2.4 M | MIT | dark | 3 |
| 12 | Cobalt2 | wesbos.theme-cobalt2 | 1.9 M | MIT | dark | 3 |
| 13 | Andromeda | EliverLara.andromeda | 1.7 M | MIT | dark | 3 |
| 14 | Noctis (Noctis + Lux) | liviuschera.noctis | 1.4 M | MIT | light + dark | 3 |
| 15 | Gruvbox | jdinhlife.gruvbox | 1.1 M | MIT | light + dark | 3 |
| 16 | Sublime Material | jprestidge.theme-material-theme | 1.0 M | MIT | light + dark | 4 |
| 17 | Omni | rocketseat.theme-omni | 1.0 M | MIT | dark | 4 |
| 18 | JellyFish | PawelBorkar.jellyfish | 1.0 M | Apache-2.0 | dark | 4 |
| 19 | Darcula | rokoroku.vscode-theme-darcula | 0.9 M | MIT | dark | 4 |
| 20 | (next by installs, chosen in batch 4) | | | | | 4 |

Atom One Dark and Atom One Light are one theme here, as its dark and light variants, so the twentieth is the next
theme by installs that passes the licence and near-duplicate checks; batch 4 picks it.

## Colours (main variants)

`bg`/`fg` are `editor.background`/`editor.foreground`; the rest are accents.

| Theme | Variant | bg | fg | comment | red | green | yellow | blue | purple | cyan | orange |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GitHub | dark | #0d1117 | #e6edf3 | #8b949e | #ff7b72 | #3fb950 | #d29922 | #58a6ff | #bc8cff | #39c5cf | #ffa657 |
| GitHub | light | #ffffff | #1f2328 | #6e7781 | #cf222e | #116329 | #4d2d00 | #0969da | #8250df | #1b7c83 | #953800 |
| One Dark Pro | dark | #282c34 | #abb2bf | #5c6370 | #e06c75 | #98c379 | #e5c07b | #61afef | #c678dd | #56b6c2 | #d19a66 |
| Dracula | dark | #282a36 | #f8f8f2 | #6272a4 | #ff5555 | #50fa7b | #f1fa8c | #bd93f9 | #ff79c6 | #8be9fd | #ffb86c |
| Atom One | dark | #282c34 | #abb2bf | #5c6370 | #e06c75 | #98c379 | #e5c07b | #61afef | #c678dd | #56b6c2 | #d19a66 |
| Atom One | light | #fafafa | #383a42 | #a0a1a7 | #e45649 | #50a14f | #c18401 | #4078f2 | #a626a4 | #0184bc | #986801 |
| Ayu | dark | #10141c | #bfbdb6 | #5a6673 | #f06b73 | #70bf56 | #fdb04c | #4fbfff | #d0a1ff | #93e2c8 | #ff8f40 |
| Ayu | light | #fcfcfc | #5c6166 | #adaeb1 | #f06b6c | #6cbf43 | #e7a100 | #21a1e2 | #a176cb | #4abc96 | #fa8532 |
| Winter is Coming | dark | #011627 | #a7dbf7 | #999999 | #ef5350 | #22da6e | #f7ecb5 | #219fd5 | #c792ea | #80cbc4 | — |
| Winter is Coming | light | #ffffff | #236ebf | #357b42 | #de3d3b | #08916a | #c5a332 | #236ebf | #7c4dff | #0097a7 | #df8618 |
| Night Owl | dark | #011627 | #d6deeb | #637777 | #ef5350 | #22da6e | #c5e478 | #82aaff | #c792ea | #21c7a8 | #f78c6c |
| Night Owl | light | #fbfbfb | #403f53 | #989fb1 | #de3d3b | #08916a | #e0af02 | #288ed7 | #d6438a | #2aa298 | — |
| One Monokai | dark | #282c34 | (default) | #676f7d | #e06c75 | #98c379 | #e5c07b | #528bff | #c678dd | #56b6c2 | #d19a66 |
| Palenight | dark | #292d3e | #bfc7d5 | #697098 | #ff5572 | #a9c77d | #ffcb6b | #82aaff | #c792ea | #89ddff | #f78c6c |
| SynthWave '84 | dark | #262335 | #ffffff | #848bbd | #fe4450 | #72f1b8 | #fede5d | #03edf9 | #ff7edb | #03edf9 | #ff8b39 |
| Shades of Purple | dark | #2d2b55 | #ffffff | #b362ff | #ec3a37 | #3ad900 | #fad000 | #7857fe | #ff2c70 | #80fcff | #ff9d00 |
| Cobalt2 | dark | #193549 | #ffffff | #0088ff | #ff628c | #3ad900 | #ffc600 | #0088ff | #fb94ff | #80fcff | #ff9d00 |
| Andromeda | dark | #23262e | #d5ced9 | #a0a1a7 | #ee5d43 | #96e072 | #ffe66d | #7cb7ff | #c74ded | #00e8c6 | #f39c12 |
| Noctis | dark | #052529 | #b2cacd | #5b858b | #e66533 | #49e9a6 | #e4b781 | #49ace9 | #df769b | #49d6e9 | #d5971a |
| Noctis (Lux) | light | #fef8ec | #005661 | #8ca6a6 | #e34e1c | #00b368 | #f49725 | #0094f0 | #ff5792 | #00bdd6 | #fa8900 |
| Gruvbox | dark | #282828 | #ebdbb2 | #928374 | #fb4934 | #b8bb26 | #fabd2f | #83a598 | #d3869b | #8ec07c | #fe8019 |
| Gruvbox | light | #fbf1c7 | #3c3836 | #928374 | #9d0006 | #79740e | #b57614 | #076678 | #8f3f71 | #427b58 | #af3a03 |
| Sublime Material | dark | #252526 | #eeffff | #546e7a | #ff5370 | #c3e88d | #ffcb6b | #82aaff | #c792ea | #89ddff | #f78c6c |
| Sublime Material | light | #f3f3f3 | #80cbc4 (too pale: will need adjusting) | #ccd7da | #e53935 | #91b859 | #ffb62c | #6182b8 | #7c4dff | #39adb5 | #f76d47 |
| Omni | dark | #191622 | #e1e1e6 | #5a4b81 | #e96379 | #67e480 | #e7de79 | #78d1e1 | #988bc7 | #a1efe4 | #e89e64 |
| JellyFish | dark | #00002c | #ffffff | #838383 | #ff5370 | #c3e88d | #ffcb6b | #82aaff | #c792ea | #89ddff | #ff7e34 |
| Darcula | dark | #242424 | #cccccc | #707070 | #f44747 | #6a8759 | #ffc66d | #7a9ec2 | #9e7bb0 | — | #cc8242 |

Where a theme's terminal colour is a different hue than its name (One Dark Pro's terminal yellow is orange-ish, Omni
uses pink as red), the table uses its syntax colour of that hue. Every value is a starting point: the contrast test
(`tests/unit/theme-contrast.test.ts`, targets in `docs/theme-validation.md`) moves any that miss to the nearest
passing shade, as for the existing themes.

## Open questions before the batches (answered: see [Decision](#decision))

1. **Size.** Each theme adds about 1.2 KB to the built dashboard (two token sets of about 40 colours). The build is
   255,184 bytes against a 256 KB budget, so about 7 KB is left: room for five or six themes, not twenty. Options:
   - raise the budget (for example to 320 KB);
   - store the themes more compactly (a table of colours turned into CSS variables at runtime, roughly 0.4 KB each),
     which still needs about 8 KB for twenty;
   - add fewer themes.
2. **Dark-only themes.** Twelve of the twenty have no light variant, but every dashboard theme has both, and the mode
   switch is separate from the theme. Options:
   - derive a light variant from the theme's accents on a light background, marked as derived;
   - follow the theme: a dark-only theme always shows dark, and the mode switch says so.

## The menu (T-152)

Eleven names make the Appearance menu long. Proposal: a scrollable list, each theme with its swatch, the current
theme scrolled into view on open, arrow keys to move.
