# Branding

Everything here is made from one drawing, the logo's source: `dashboard/src/assets/atm-logo.svg`, drawn in
`currentColor` (the dashboard's logo, favicon and About come straight from it). Never edit these files by hand:
change the source, or the pages in `generate.mjs`, then regenerate.

| File | What it is | Where it's used |
|---|---|---|
| `atm-logo.svg` | The logo in the accent blue (`#2f81f7`, the favicon's colour) | The README's header |
| `atm-logo.png` | 512×512, the blue logo on the dark background (`#0d1117`) | The GitHub org's avatar (avatars take only PNG, JPG or GIF) |
| `social-preview.png` | 1280×640, the logo, name and tagline | GitHub's social preview, shown when the repository is linked |
| `generate.mjs` | The script that makes them, with the HTML it renders the PNGs from | `npm run branding` |

## Regenerate

In `dashboard/` (where Playwright is installed):

```bash
npm run branding
```

It rewrites all three files. Then upload what changed by hand, GitHub doesn't read them from the repository:
- `social-preview.png`: the repository's Settings → General → Social preview;
- `atm-logo.png`: the org's Settings → Profile → Profile picture.

`dashboard/tests/unit/readme-logo.test.ts` fails when `atm-logo.svg` no longer matches the source. The PNGs aren't
compared (they differ by platform): look at them before committing.
