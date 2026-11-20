# MLB Pinpoint Challenge — OBS overlays

Control page + OBS display for an MLB "Pinpoint" game, built on the same rules and stats as
[jomboytrivia.com/#mlb](https://www.jomboytrivia.com/#mlb). Sister app of
[NFL Pinpoint](https://github.com/RobSJomboy/NFL-Pinpoint) — same controls, MLB data, and the card from
`PINPOINT GRAPHICS 4.psd`.

**The game:** a ranked Top-N list. Name a player on it and you score his rank — #99 is worth 99, #1 is worth 1.
Name someone who isn't on it and it's a strike; three strikes and you're out. The last player on the list is a
**PINPOINT**. Rate stats (AVG, OBP, SLG, OPS, ERA, WHIP) use the site's qualifiers; guessing a player who would
rank but didn't qualify is a **mulligan** (no strike).

## Files
| file | what |
|---|---|
| `index.html` | control page (producer) |
| `display.html?room=mlb-pinpoint` | OBS browser source, 1920×1080, transparent |
| `pp.js` / `pp.css` | list math, renderer (PSD card), transport |
| `mlbdata.js` | jomboytrivia.com MLB Pinpoint stats (Lahman, 1871→now, Negro Leagues included) + bWAR + MLB photo ids |
| `img/star.png` | the star badge, exported from the PSD |
| `sfx/` | the 25 whooshes |

## Lists
- **Jomboy Trivia** — every MLB Daily (Top 100) and Mini (Top 10), using the site's own stored answers.
- **Build** — any stat (hitting, pitching, WAR), any years, All MLB / AL / NL / Negro Leagues / any franchises,
  Top 10/25/50/100. Rate stats show the qualifier.
- **Upload** / **Saved** — your own lists, same as NFL Pinpoint.

## Photos
MLB cutouts (img.mlbstatic.com "silo") where they exist, then MLB's regular headshot, then Wikipedia — real photos
only, never generated. Everything else is the same as NFL Pinpoint: preload on list load, Photo check to step
through the cards, move / zoom any player's photo, saved photo library.

## Fonts
The PSD uses **PRIMETIME** (name, with ten drop shadows) and **Designer** (numbers). They are not in this repo
(licensing) — install them on the control and OBS computers. Until then the card falls back to Archivo Black /
Russo One. Every text element can be switched to any of the 139 fonts under **Fonts**.

**Rank reveal:** the star sits on the card blank; Space (or ★ Reveal rank) pulls the blank sticker up off it to show the rank, centred in the star.

Keys: `Space` reveal rank · `C` card · `S` scoreboard · `X` strikes · `T` turn arrow · `B` board ·
`←/→` picker · `U` undo.
