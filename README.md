# tens

A number puzzle (Ten or Same / Numberama / Take Ten) as an iPhone web app.
Add it to your Home Screen from Safari and it opens full screen and works offline.

Plain HTML, CSS and JavaScript. No build step, no backend. Your games, best score and streak are saved on the phone (localStorage).

## Files

| File | What it is |
| --- | --- |
| `index.html` | The four screens: Home, Game, How to play, Board cleared. |
| `css/style.css` | All styling. Colours are at the top (`--flame`, `--sand`, ...). |
| `js/game.js` | The rules: neighbours, pairs, Add, row clearing, and the solvable board generator. |
| `js/app.js` | Screens, buttons, saving, undo, hints, daily challenge and streak. |
| `sw.js` | Service worker: caches everything for offline use. |
| `manifest.webmanifest` | Home Screen name, icon and colours. |
| `fonts/` | Bricolage Grotesque and DM Mono (SIL Open Font License), bundled for offline use. |
| `icons/` | App icons. |

## Running it on your computer

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The offline cache is switched off on localhost so your edits show straight away.

## Putting it online (free) with GitHub Pages

1. Create a free account at github.com, then a new **public** repository called `tens`.
2. On the repository page click **Add file → Upload files**, drag in everything inside this `tens` folder (not the folder itself), and click **Commit changes**.
3. Go to **Settings → Pages**. Under "Build and deployment" choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute or two your app is live at `https://YOUR-USERNAME.github.io/tens/`.

Quicker alternative: go to https://app.netlify.com/drop and drag the `tens` folder onto the page. You get a link straight away (sign up free to keep it).

## Adding it to your iPhone

1. Open the link in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open it from the new icon. It runs full screen and works without a connection.

## Making a change

1. Edit the file(s).
2. Open `sw.js` and bump `VERSION` (e.g. `"v1"` → `"v2"`) so phones download the new files.
3. Upload the changed files to GitHub again (or re-drop the folder on Netlify).
