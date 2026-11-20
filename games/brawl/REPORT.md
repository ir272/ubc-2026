# Ringout report (in progress)

## Calls the lead made without the owner (his to overturn)

- **Name.** The show is called Ringout. Folder and channel id stay `brawl`.
- **Cast.** Four robots: Kiln (heavy hitter), Tick (fast and light), Gantry (long reach), Vise (grappler).
- **Set.** Dry Dock 9, a fight deck slung between gantry cranes over a night shipyard.
- **Layout.** A main deck, two side platforms and one top platform. This is the genre's most common layout; the set dressing is ours.
- **Window A is seeded.** The opening "Who wins?" window is opened as a seeded window so the fight's random seed comes from the lock and nobody can know it while betting. The fight is then fully determined by that seed plus the plans the models send, all of which are in the feed, so anyone can replay it. Break windows are live (not seeded).
- **Sudden death.** At three minutes the fight does not stop for a tiebreak: knockback starts at 1.5 times and grows until someone is out.
- **Plans take effect on a 3 s clock**, at the first boundary at least 0.75 s after the answer arrives, so the stage (which replays the same simulation about 0.4 s behind) always has a plan before its tick.
- **The stage replays the simulation locally** from the feed (fight_start, plan, state checkpoints) instead of streaming positions. Checkpoints every 2 s let a viewer join mid-fight and correct any drift.

## Status

See progress.html and ROUNDS.md.
