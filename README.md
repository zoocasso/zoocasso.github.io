# zoocasso.github.io

Personal site of Hyeongju Lee (이형주), data and backend engineer and 3D vision researcher.

- Korean: https://zoocasso.github.io/
- English: https://zoocasso.github.io/en/

The home page opens on a lens array lab: an image is captured through a simulated pinhole array,
rearranged with RIM, and reconstructed at different depths, with synthesized music and sound.

## Data

The Lytro sample in the lab (`src/img/lytro-views-*.webp`, `src/img/lytro-depth-*.png`) is derived from
the occlusions_26 light field of the Stanford Lytro Light Field Archive (A. S. Raj, M. Lowney, R. Shah,
G. Wetzstein, 2016, http://lightfields.stanford.edu/LF2016.html). The central 8 × 8 views of the raw
lens-array image were cropped to 368 × 368 lenses, resized to 128 and 64 lenses, colour-matched to the
archive's processed image, and stored as a mosaic of views. The depth map is the per-lens refocus shift
at which the 64 views agree best. The page credits the archive wherever the sample is shown.

## Layout

| Path | What it holds |
|---|---|
| `src/pages/ko/`, `src/pages/en/` | Page bodies. Each file starts with a `<!--meta {...} -->` comment (title, description, nav) |
| `data/facts.json` | Every number shown on the site, with the source it was taken from. Pages use `{{f:key}}` |
| `src/assets/` | `site.css`, `site.js` (email copy, comparison slider, copy buttons), `lab.js` (WebGL2 lab and Web Audio) |
| `src/img/`, `src/files/` | Images and the public CV and portfolio PDFs (without phone numbers) |
| `build.py` | Builds `dist/` with the Python standard library and checks it |

## Build

```
python build.py            # build and check
python build.py --serve    # then serve dist/ on http://127.0.0.1:8000
```

The build stops if a page uses an unknown fact, shows a phone number or a plain email address,
has more or fewer than one `<h1>`, has an image without `alt`, or links to a page that does not exist.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes `dist/` to GitHub Pages.
