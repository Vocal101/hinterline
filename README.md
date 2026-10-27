# Hinterline

A transport tycoon game. Lay railway across open country, run lorries, buses, ships and aircraft, carry coal to power stations and passengers between growing towns, and build a company that outlasts its rivals over a hundred years of changing technology.

Plain HTML/CSS/JavaScript: no build step, no installs, no external art or audio. Every building, vehicle, tree and sound is generated in code.

## Play online
**https://vocal101.github.io/hinterline/** runs in the browser with nothing to install.

## Download and play offline
1. At the top of this page, click the green **Code** button, then **Download ZIP**.
2. Unzip it (on Windows, right-click the file and choose **Extract All**).
3. Open the unzipped folder and double-click `index.html`. Chrome or Edge is recommended.

If you use git: `git clone https://github.com/Vocal101/hinterline.git`, then open `index.html` the same way.

Progress saves in your browser, so the online version and a downloaded copy keep separate saves. Without internet the game still plays fully but falls back to default fonts.

Optional local server: `python -m http.server 8771` in this folder, then visit http://localhost:8771

## How to play

- **Start with the Tutorial** on the title screen. In five short parts it shows you around the screen, explains how money is made, and walks you through your first coal railway and a bus line. After that, beginner tips pop up when something new comes up; you can turn them off in Settings.
- Money comes from carrying cargo. You're paid by distance and by how quickly it arrives, so long, fast routes pay best.
- Raw materials (coal, ore, grain, timber, oil) go to industries that accept them, which then produce goods for towns. Towns produce passengers and mail.
- A station only receives cargo once one of your vehicles has called there to load. The blue shading when you place a station shows its catchment.
- Industries you serve well grow. Neglected ones shrink and close. Towns you serve grow faster, and their councils like you more.
- Three climates: **Temperate Vales**, **Northern Reaches** (towns above the snowline need food), and **Sunward Coast** (desert towns need water and food).

### Controls

| Action | Input |
| --- | --- |
| Pan | Right-drag, or left-drag with no tool selected. Arrow keys. |
| Zoom | Mouse wheel, + and - |
| Cancel a tool | Right-click or Esc |
| Pause / speed | Space / 1 2 3 4 |
| Rail, road, water, airports, landscaping | R, T, B, A, L |
| Rotate a station while placing | R |
| Remove instead of build | Hold Ctrl |
| Demolish / land info | Delete / Q |
| Minimap, finances, graphs | M, F, G |
| Quick save | Ctrl+S |

### Signals

With no signals, only one train can safely use a stretch of track. Trains on the same line will collide. Put one-way **block signals** every few tiles on double track to run many trains. Use **path signals** at junctions and station entrances so trains reserve only the route they need and pick a free platform.

## Features

- Procedural worlds with seeds: map size, terrain roughness, sea level, town and industry density, start year from 1860 to 2040.
- Railways on slopes, bridges (seven designs) and tunnels; block, path and one-way path signals; stations of up to 5 platforms by 7 tiles; four rail types (steam-era railway, electrified, monorail, maglev).
- Road vehicles with drive-through stops, ships with docks and buoys, and aircraft at four airport sizes, including heliports.
- 20 cargo types across three industry chains; production that responds to service; industries opening and closing; subsidies; booms, recessions and disasters.
- More than 120 vehicle models from 1860 onward, with reliability, breakdowns, servicing, ageing, autorenew and autoreplace. Orders support full load, transfer, unload, go-via, depot visits, shared orders and timed waits. Vehicles can be sorted into groups.
- Loans and interest, inflation, yearly accounts, company value and performance, graphs, and a league table. Town councils offer advertising, statues, building funds, exclusive rights and bribery.
- AI rival companies that build rail, road, air and sea routes.
- Eight scenarios with goals, sandbox play, three difficulty levels, 33 achievements and high scores.
- Seasons, day and night with lit windows, rain, snow and storms. Procedural sound, ambient soundscapes and generative music.
- Multiple save slots plus autosave.

## For developers

- Open `index.html?dev` for the `T` test harness. Examples: `T.newGame()`, `T.autoRail()`, `T.sim(days)`, `T.toolTest()` (drives every build tool through the real input handlers), `T.money()`, `T.unlockAll()`, `T.year(y)`, `T.longSim(years)`.
- Headless simulation in Node: `node sim/longsim.js <years> <seed> <size> <ais> <climate> <startYear>` checks invariants as it runs. `node sim/ai_report.js <years>` prints the rival companies' finances.
- `gallery.html?w=ind|house|special|veh` shows the generated art.
