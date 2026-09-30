# 🛰️ Pinpoint

A daily geography game: a satellite image slowly zooms out, and you drop a pin where you think it is.
Fewer zoom-outs = more points. Five places a day, the same for everyone.

## Run it
- In VS Code, open a terminal (Ctrl + `) and run: `node server.js`
- Open http://localhost:5173 (use your browser's phone view via F12 → device toolbar to see it as on a phone)

Or install the **Live Server** extension in VS Code, right-click `index.html` → "Open with Live Server".

## Files
- `index.html`: the screens (start, game, end)
- `style.css`: the look (mobile-first)
- `locations.js`: the list of places. Add your own!
- `game.js`: the game logic (daily seed, scoring, streaks, sharing)

## Tweak it
Settings are at the top of `game.js` (rounds, zoom penalty, etc.).

## Credits / terms
- Satellite imagery: Esri World Imagery (free for non-commercial use with attribution)
- Guess map: © OpenStreetMap contributors (fine for light use; switch to a tile provider for real traffic)
- Map library: Leaflet

## Friends leaderboard (Supabase)
1. Create a free account and project at https://supabase.com
2. In the project, open **SQL Editor → New query**, paste `supabase-setup.sql` and click **Run**
3. Go to **Project Settings → API** (or click **Connect**) and copy the **Project URL** and the **anon / publishable** key
4. Paste them into `config.js`. Never use the `service_role` / secret key
5. Commit and push. The 🏆 buttons show up automatically

Players choose a nickname + group. Invite links look like `…/pinpoint/?g=groupname`.
Note: scores are sent from the browser, so a tech-savvy friend could fake one. Fine for fun among friends.
