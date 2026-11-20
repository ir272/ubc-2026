# Ringout assets

Every vendored file, where it came from, who made it and its licence. All files live under
`assets/vendor/`. Downloaded originals were sliced, peak-normalised to about -1 dBFS and encoded
to mp3 with ffmpeg; the slice is given where only part of a file is used.

## Sound (`assets/vendor/sound/`, 3.3 MB in total, round 4)

Every file is CC0 (public domain dedication) except the two music loops, which are CC-BY 4.0 and
need the credit lines below wherever the game is shown. Each freesound page was checked for the CC0
licence link on 2026-11-19 by the download script (a file whose page showed any other licence was
skipped); freesound files are the site's public high-quality mp3 previews. One-shots were sliced,
faded at the end, peak-normalised to -1 dBFS and encoded as 96 kbps mono mp3 at 44.1 kHz (the
explosions, the horns hit and the cheering bed at 128 kbps stereo). In the browser every sample is
decoded once to mono at 32 kHz and the music loop a phase needs to mono at 24 kHz: about 20 MB of
decoded audio measured in the live smoke test (captures/sound/r4/live-smoke.json).

### Music (CC-BY 4.0)

| file | source | author | licence | slice / treatment |
|---|---|---|---|---|
| music-fight.mp3 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Metalmania.mp3 ("Metalmania", 150 BPM) | Kevin MacLeod (incompetech.com) | CC-BY 4.0 | 32 bars, 77.575 to 128.775 s (50 ms before the downbeats), the first 30 ms crossfaded with the audio after the end; 51.2 s seamless loop, 160 kbps stereo; the fight and the knockout through its replay |
| music-bed.mp3 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Industrial%20Cinematic.mp3 ("Industrial Cinematic", 110 BPM) | Kevin MacLeod (incompetech.com) | CC-BY 4.0 | 16 bars, 87.25 to 122.16 s, same treatment; 34.91 s seamless loop; every other phase |

Credit lines (required):

- "Metalmania" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/
- "Industrial Cinematic" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/

The licence was checked on https://incompetech.com/music/royalty-free/licenses/ (it links
creativecommons.org/licenses/by/4.0/) on 2026-11-19.

### Effects and crowd (CC0)

| file | source | author | licence | slice / used for |
|---|---|---|---|---|
| p-light-1.mp3 | https://freesound.org/people/SypherZent/sounds/420673/ (Basic Melee Hit) | SypherZent | CC0 | whole; light hit |
| p-light-2.mp3 | https://freesound.org/people/Mrguff/sounds/369711/ (Hit Impact) | Mrguff | CC0 | 0-0.42 s; light hit, shield body |
| p-light-3.mp3 | https://freesound.org/people/Merrick079/sounds/566436/ (Punch1.wav) | Merrick079 | CC0 | 0-0.5 s; light hit, crack layer |
| p-light-4.mp3 | https://freesound.org/people/taylorsyoung@gmail.com/sounds/94778/ (Punch_1-2.wav) | taylorsyoung@gmail.com | CC0 | 0.18-0.6 s; light hit, grab and shield body |
| p-med-1.mp3 | https://freesound.org/people/Huminaatio/sounds/390462/ (Punch in the face) | Huminaatio | CC0 | 0-0.62 s; medium hit, crack layer |
| p-med-2.mp3 | https://freesound.org/people/janbezouska/sounds/399183/ (Major punch) | janbezouska | CC0 | 0.06-0.8 s; medium hit, crack layer of every class |
| p-med-3.mp3 | https://freesound.org/people/thebondman/sounds/111739/ (indiana-jones-style-punch.wav) | thebondman | CC0 | 0-0.6 s; medium hit |
| p-med-4.mp3 | https://freesound.org/people/Ekokubza123/sounds/104183/ (punch.wav) | Ekokubza123 | CC0 | 0.35-0.85 s; medium hit, crack layer |
| p-heavy-1.mp3 | https://freesound.org/people/alegemaate/sounds/364690/ (Human Impact on Ground) | alegemaate | CC0 | 0-0.75 s; heavy hit body |
| p-heavy-2.mp3 | https://freesound.org/people/septalium1/sounds/584293/ (Falling Thud) | septalium1 | CC0 | 0.22-0.75 s; heavy hit body |
| p-heavy-3.mp3 | https://freesound.org/people/TILIADESIGN/sounds/488720/ (Fight - perfect punch/hit/kick/stroke) | TILIADESIGN | CC0 | 0.36-0.95 s (the hit only); heavy hit body |
| p-heavy-4.mp3 | https://freesound.org/people/egomassive/sounds/536766/ (Thud.ogg) | egomassive | CC0 | 0.07-0.45 s; heavy hit body, heavy footfalls, landings, lock |
| impact-low.mp3 | https://freesound.org/people/AudioPapkin/sounds/430978/ (Low impact.wav) | AudioPapkin | CC0 | 0-1.6 s, faded; the deep impact under heavy hits, show hits, countdown |
| impact-big.mp3 | https://freesound.org/people/AudioPapkin/sounds/430977/ (Big impact.wav) | AudioPapkin | CC0 | 0-3.2 s, faded; the lethal hit, the knockout, the call swell (reversed) |
| impact-cine.mp3 | https://freesound.org/people/Johnnie_Holiday/sounds/671375/ (FX Cinematic Impact.wav) | Johnnie_Holiday | CC0 | 0-2.6 s, faded; the lethal hit, pick-reveal and payout swells (reversed) |
| kick.mp3 | https://freesound.org/people/NoirPantalon/sounds/102130/ (Hard_Subby_Kick.mp3) | NoirPantalon | CC0 | whole (kept from round 3); the drum under heavy, lethal, knockout and show hits |
| ko-blast-1.mp3 | https://freesound.org/people/derplayer/sounds/587194/ (explosion_big_01.ogg) | derplayer | CC0 | whole, faded; the knockout (alternates with ko-blast-2) |
| ko-blast-2.mp3 | https://freesound.org/people/derplayer/sounds/587193/ (explosion_big_02.ogg) | derplayer | CC0 | whole, faded; the knockout |
| ko-boom.mp3 | https://freesound.org/people/rhapsodize/sounds/255111/ (Cinematic_Boom_Rhapsodize.wav) | rhapsodize | CC0 | 0-3.2 s, faded; the low boom under the knockout |
| show-horns.mp3 | https://freesound.org/people/DeVern/sounds/427803/ (Cinematic Hit With Horns.wav) | DeVern | CC0 | 0-3.6 s, faded; the call mark, versus, the start and the winner |
| clock-tick.mp3 | https://freesound.org/people/abyeditsound/sounds/450509/ (ClockTickSound_01.wav) | abyeditsound | CC0 | one tick, 1.13-1.45 s; the last five seconds of a window, plan changes, window open |
| lock-1.mp3 | https://freesound.org/people/randbsoundbites/sounds/791845/ (Locking or unlocking door) | randbsoundbites | CC0 | 0.25-1.05 s; bets lock |
| step-a.mp3 | https://freesound.org/people/Yoyodaman234/sounds/166507/ (concrete footstep 3) | Yoyodaman234 | CC0 | 0-0.42 s; footsteps |
| step-b.mp3 | https://freesound.org/people/VKProduktion/sounds/251788/ (Footstep 01.wav) | VKProduktion | CC0 | 0.17-0.62 s; footsteps |
| step-c.mp3, step-d.mp3 | https://freesound.org/people/Stefan021/sounds/798870/ (Work boots on wood floor) | Stefan021 | CC0 | 11.09-11.5 s and 4.23-4.65 s; footsteps |
| land-1.mp3 | https://freesound.org/people/kfatehi/sounds/363922/ (land.wav) | kfatehi | CC0 | 0-0.75 s; landings, roster landings |
| swing-1.mp3 | https://freesound.org/people/SypherZent/sounds/420670/ (Strong Melee Swing) | SypherZent | CC0 | whole; swings, rolls, versus |
| swing-2.mp3 | https://freesound.org/people/qubodup/sounds/59988/ (SWOSH-01 44.1kHz) | qubodup | CC0 | whole; swings, jumps, versus |
| swing-3.mp3 | https://freesound.org/people/SypherZent/sounds/420668/ (Basic Melee Swing / Miss / Whoosh) | SypherZent | CC0 | whole; swings, dodges, projectiles |
| swing-4.mp3 | https://freesound.org/people/Jofae/sounds/389590/ (Swing Woosh) | Jofae | CC0 | whole; swings |
| swoosh-long.mp3 | https://freesound.org/people/freakinbehemoth/sounds/243400/ (woosh.wav) | freakinbehemoth | CC0 | 0.35-1.3 s; dash, throws, big swings, launches, the stinger, respawn (reversed) |
| shield-1.mp3 | https://freesound.org/people/nekoninja/sounds/370203/ (shield guard) | nekoninja | CC0 | 0-0.75 s; shield block, shield break, clank |
| grab-1.mp3 | https://freesound.org/people/alegemaate/sounds/667271/ (Cloth Grab) | alegemaate | CC0 | 0.1-0.45 s; grabs, ledge catches |
| kiln-hiss.mp3 | https://freesound.org/people/wubitog/sounds/234782/ (Steam/hiss) | wubitog | CC0 | kept from round 3; Kiln colour on medium and bigger hits |
| tick-ratchet.mp3 | https://freesound.org/people/Nomadyag/sounds/193058/ (ratchet.wav) | Nomadyag | CC0 | kept from round 3; Tick colour |
| gantry-air.mp3 | https://freesound.org/people/reg7783/sounds/131302/ (release_air_pffft.wav) | reg7783 | CC0 | kept from round 3; Gantry colour |
| vise-press.mp3 | https://freesound.org/people/artinstitute/sounds/468094/ (Hydraulic press.wav) | artinstitute | CC0 | kept from round 3; Vise colour |
| crowd-bed.mp3 | https://freesound.org/people/SEF7/sounds/706497/ (Rogers Arena, NHL game atmosphere) | SEF7 | CC0 | the first 17.5 s of the round-3 cut (9.5 s on in the source), made into a seamless 17 s loop (600 ms crossfade with what followed), mono; the murmur under every phase |
| crowd-cheer-bed.mp3 | https://freesound.org/people/craigsmith/sounds/480765/ (R08-54-Large Crowd Cheering at Event.wav) | craigsmith | CC0 | 1-26 s made into a seamless 25 s loop (600 ms crossfade), stereo; the cheering crowd whose level follows the action |
| crowd-roar.mp3 | https://freesound.org/people/benfree/sounds/130568/ (RoaringCrowd.wav) | benfree | CC0 | kept from round 3; the knockout, the start and the winner |
| crowd-cheer.mp3 | https://freesound.org/people/FoolBoyMedia/sounds/397434/ (Crowd Cheer) | FoolBoyMedia | CC0 | kept from round 3; under the knockout and winner roar |
| crowd-ooh.mp3 | https://freesound.org/people/noah0189/sounds/264499/ (Crowd Ooohs and Ahhhs in Excitement) | noah0189 | CC0 | kept from round 3; heavy and lethal hits |
| crowd-ooh2.mp3 | https://freesound.org/people/jbledger1984/sounds/613179/ ("OOOH" group of males) | jbledger1984 | CC0 | kept from round 3; heavy hits |

Made in code (no files): only shaping now (filters, decay envelopes, playing a sample backwards for a
swell into a hit), the reverb impulse response (`src/stage/audio/engine.ts`) and a fallback music
loop (`src/stage/audio/music.ts`) that plays only if a recorded loop cannot load. No hit, show or
movement sound is synthesised any more.

Removed in round 4 (no longer shipped): the anvil, clang, car-crash clank, hammer, wrench, plate,
metal clink, mech step, servo, relay, gunshot crack and debris recordings of round 3, and the two
round-3 music loops (cynicmusic's battle theme, CleytonKauff's menu theme).
