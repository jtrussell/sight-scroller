# Sight Scroller

A browser-based side scroller, in the spirit of the Chrome t-rex game, where
players advance by identifying musical notes.

## Run it

No build step, no server. Just open `index.html` in a browser.

## Deploy

`.github/workflows/deploy.yml` publishes the site to GitHub Pages on every
push to `main` (or manually via the Actions tab). One-time repo setup:
**Settings → Pages → Source → "GitHub Actions"**.

## How to play

An 8-bit runner jogs along the top line of a musical staff. Notes scroll in
from the right, each paired with an obstacle on the track (spike, hurdle, or
ditch). Three buttons under the staff offer note names — pick the right one
before the runner reaches the note and they'll jump the obstacle (+1 point).
Guess wrong, or fail to guess in time, and it's a death spin.

Correct answers also play the actual pitch of the note, so your ears learn
alongside your eyes.

- **Keys:** `1` `2` `3` to answer by position, or type the note letter
  itself (`A`–`G`, when it's one of the choices). `P` to pause, `M` to mute.

## Modes

- **Gym** — 3 lives. Lose one per miss; after a death you respawn
  invulnerable (blinking, buttons disabled) until the missed note is behind
  you. Extra-life hearts appear at random along the track (cap: 9).
- **Virtuoso** — 1 life, and the scroll speed increases every 10 points.

Each mode keeps its own top-10 leaderboard; new high scores prompt for
initials.

## Settings

The settings screen lets an admin choose:

- **Clef** — treble or bass (each remembers its own note selection).
- **Note spacing** — how far apart notes spawn, i.e. how much thinking time
  per note (shown as ~seconds per note at starting speed).
- **Note pool** — which notes appear, from below-staff ledger notes up
  through above-staff ones (minimum 2 selected). Defaults to the lines and
  spaces of the staff itself.
- **Sound** on/off.

## Storage

Everything (settings + leaderboards) lives in `localStorage` on the device:
`ss.settings`, `ss.scores.gym`, `ss.scores.virtuoso`.
