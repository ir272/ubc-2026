# Blood Moon (Ringout) assets

Every vendored file, where it came from, who made it and its licence. All files live under
`assets/vendor/`. Downloaded originals were sliced, peak-normalised to about -1 dBFS and encoded
to mp3 with ffmpeg; the slice is given where only part of a file is used.

## Sound (`assets/vendor/sound/`, 2.8 MB in total, Blood Moon)

The fight is now the Count against the Wolf, hand-inked on black, and the sound follows: one
score (Danse Macabre) and a small set of recorded effects. Every effect is CC0; the four music
files are CC BY 4.0 and need the credit lines below wherever the game is shown. Each freesound page
was checked for its licence link on 2026-11-20 (only pages linking
creativecommons.org/publicdomain/zero/1.0/ were used); freesound files are the site's public
high-quality mp3 previews. One-shots were sliced, faded at the end, peak-normalised to -1 dBFS and
encoded as 96 kbps mono mp3 at 44.1 kHz (the howl and the bell at 112 kbps). In the browser every
sample is decoded once to mono at 32 kHz and the music loop a phase needs to mono at 24 kHz.

### Music (CC BY 4.0)

All four come from Kevin MacLeod's recording of Danse Macabre and its two companion pieces. Each was
cut as below, rolled off above 5 kHz (12 dB per octave), levelled to the integrated loudness given
(true peak under -1 dBTP; measured peaks -5 to -10 dBFS) and encoded as 128 kbps stereo mp3.

| file | source | author | licence | passage / treatment / plays |
|---|---|---|---|---|
| music-danse-fight.mp3 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100546 ("Danse Macabre", candidate `music-candidates/fight_danse_macabre.mp3`) | Kevin MacLeod (incompetech.com) | CC BY 4.0 | 1:09.49 to 2:40.075 (90.585 s), the waltz at full orchestra; the end runs back into the start where the theme comes round again, head crossfaded over 250 ms with what followed the end; -20.5 LUFS; the fight and the knockout hold |
| music-danse-opening.mp3 | same recording | Kevin MacLeod (incompetech.com) | CC BY 4.0 | 0:00.95 to 0:21.70 (20.75 s), the opening: harp striking midnight, the solo violin, the low pizzicato; tail faded over 0.4 s; -20.4 LUFS, played about 7 dB under the fight; the call, select, versus, predictions, the break after the replay starts, and after the verdict sting |
| sting-danse-finale.mp3 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100552 ("Danse Macabre - Low Strings Finale") | Kevin MacLeod (incompetech.com) | CC BY 4.0 | 0 to 10.5 s, faded over the last 1.2 s; -19.5 LUFS; the verdict (the opening steps aside for it) |
| sting-danse-hit.mp3 | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100558 ("Danse Macabre - Big Hit 1") | Kevin MacLeod (incompetech.com) | CC BY 4.0 | 0.40 to 4.20 s, faded over the last 1 s; -19.5 LUFS; the knockout that ends the match |

Credit lines (required):

- "Danse Macabre" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/
- "Danse Macabre - Low Strings Finale" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/
- "Danse Macabre - Big Hit 1" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/

The licences were read on the track pages on 2026-11-20 (see `music-candidates/CREDITS.md`).

### Effects (CC0)

| file | source | author | licence | slice / used for |
|---|---|---|---|---|
| cloak-1.mp3 to cloak-4.mp3 | https://freesound.org/people/Nox_Sound/sounds/495390/ (Foley_Clothes_Jacket_Whoosh_Sequence_Stereo.wav) | Nox_Sound | CC0 | 0.05-0.85, 1.38-2.18, 2.75-3.45, 3.92-4.60 s; light and medium swings, jumps, dodges, launches |
| cloak-big-1.mp3, cloak-big-2.mp3 | https://freesound.org/people/saturdaysoundguy/sounds/391448/ (Shirt Whoosh 1.wav) | saturdaysoundguy | CC0 | 6.72-7.34 and 9.60-10.20 s; heavy swings, throws, the pounce leap, versus, wipes, shield break |
| claw-1.mp3 | https://freesound.org/people/Abyssmal/sounds/35213/ (slashkut.wav) | Abyssmal | CC0 | whole, low-passed at 7 kHz; claw strikes |
| claw-2.mp3 | https://freesound.org/people/mrickey13/sounds/515625/ (Throw/Swipe) | mrickey13 | CC0 | 0-0.32 s; claw strikes, clashes |
| bite-1.mp3 | https://freesound.org/people/Jofae/sounds/353067/ (Bite (Cartoon Style)) | Jofae | CC0 | whole; the Wolf's bites, his grab |
| bite-2.mp3 | https://freesound.org/people/LucasDuff/sounds/467701/ (monster bite) | LucasDuff | CC0 | 0.36-0.96 s; the Wolf's bites |
| crack-lethal.mp3 | https://freesound.org/people/cinevid/sounds/144159/ (BreakingNeck.wav) | cinevid | CC0 | 0.12-0.75 s; the one crack on a lethal hit |
| bats-1.mp3, bats-2.mp3 | https://freesound.org/people/Gammelsmurfen778/sounds/546823/ (Bat wings) | Gammelsmurfen778 | CC0 | 2.30-3.75 and 6.20-7.95 s; the Count's Bat Swarm (one flutter per swarm) |
| bat-squeak.mp3 | https://freesound.org/people/Breviceps/sounds/445958/ (Cartoon - Bat / Mouse Squeak) | Breviceps | CC0 | whole; played pitched down and low-passed, quiet, on most swarms |
| mist.mp3 | https://freesound.org/people/PrdiChlp/sounds/181889/ (Whosh - Reversed/Reverbed breath) | PrdiChlp | CC0 | 1.20-2.35 s (the swell and its crest); the Count's Mist Step, respawn, the payout beat |
| snarl-1.mp3 | https://freesound.org/people/JoseAgudelo/sounds/472401/ (21_Lobo_gruñendo.wav) | JoseAgudelo | CC0 | 5.90-7.40 s; the Wolf's Pounce |
| snarl-2.mp3 | https://freesound.org/people/Christopherderp/sounds/342204/ (Beast Snarling) | Christopherderp | CC0 | 0.10-1.90 s; the Wolf's Pounce |
| howl.mp3 | https://freesound.org/people/NaturesTemper/sounds/398430/ (Wolf howl) | NaturesTemper | CC0 | 0.80-7.90 s; the Wolf's Howl and the Wolf's win |
| candle-snuff.mp3 | https://freesound.org/people/Reitanna/sounds/242867/ (blowing out candle.wav) | Reitanna | CC0 | 0.20-0.62 s; a life lost |
| bell-toll.mp3 | https://freesound.org/people/LadyCailin/sounds/62964/ (Deep Bell.wav) | LadyCailin | CC0 | 0-9 s, faded over the last 3.5 s; one toll per knockout |
| quill-1.mp3, quill-2.mp3 | https://freesound.org/people/brktkrgll/sounds/856167/ (Ink Quill Writing on Parchment ASMR) | brktkrgll | CC0 | 1.00-2.30 and 3.88-4.78 s; titles drawing in |
| night-bed.mp3 | https://freesound.org/people/sleepCircle/sounds/22331/ (wind.ogg) | sleepCircle | CC0 | 3-23 s made into a seamless 20 s loop (1.5 s crossfade), low-passed at 3 kHz, 64 kbps mono; the night under the fight, barely there |

Kept from round 4 (non-metal; sources as recorded then):

| file | source | author | licence | used for |
|---|---|---|---|---|
| p-light-1.mp3 | https://freesound.org/people/SypherZent/sounds/420673/ (Basic Melee Hit) | SypherZent | CC0 | light hits, the lethal contact tick |
| p-light-2.mp3 | https://freesound.org/people/Mrguff/sounds/369711/ (Hit Impact), 0-0.42 s | Mrguff | CC0 | light hits, clashes |
| p-light-3.mp3 | https://freesound.org/people/Merrick079/sounds/566436/ (Punch1.wav), 0-0.5 s | Merrick079 | CC0 | light hits |
| p-light-4.mp3 | https://freesound.org/people/taylorsyoung@gmail.com/sounds/94778/ (Punch_1-2.wav), 0.18-0.6 s | taylorsyoung@gmail.com | CC0 | light hits, the Count's grab |
| p-med-1.mp3 | https://freesound.org/people/Huminaatio/sounds/390462/ (Punch in the face), 0-0.62 s | Huminaatio | CC0 | medium hits |
| p-med-2.mp3 | https://freesound.org/people/janbezouska/sounds/399183/ (Major punch), 0.06-0.8 s | janbezouska | CC0 | medium hits |
| p-med-3.mp3 | https://freesound.org/people/thebondman/sounds/111739/ (indiana-jones-style-punch.wav), 0-0.6 s | thebondman | CC0 | medium hits |
| p-med-4.mp3 | https://freesound.org/people/Ekokubza123/sounds/104183/ (punch.wav), 0.35-0.85 s | Ekokubza123 | CC0 | medium hits |
| p-heavy-1.mp3 | https://freesound.org/people/alegemaate/sounds/364690/ (Human Impact on Ground), 0-0.75 s | alegemaate | CC0 | heavy and lethal hits |
| p-heavy-2.mp3 | https://freesound.org/people/septalium1/sounds/584293/ (Falling Thud), 0.22-0.75 s | septalium1 | CC0 | heavy and lethal hits |
| p-heavy-3.mp3 | https://freesound.org/people/TILIADESIGN/sounds/488720/ (Fight - perfect punch/hit/kick/stroke), 0.36-0.95 s | TILIADESIGN | CC0 | heavy and lethal hits |
| p-heavy-4.mp3 | https://freesound.org/people/egomassive/sounds/536766/ (Thud.ogg), 0.07-0.45 s | egomassive | CC0 | heavy hits, the shield's leather thump, bounces, the lock |
| impact-low.mp3 | https://freesound.org/people/AudioPapkin/sounds/430978/ (Low impact.wav), 0-1.6 s | AudioPapkin | CC0 | under heavy hits; the soft low thump under titles and the countdown |
| impact-big.mp3 | https://freesound.org/people/AudioPapkin/sounds/430977/ (Big impact.wav), 0-3.2 s | AudioPapkin | CC0 | the lethal hit |
| step-a.mp3 | https://freesound.org/people/Yoyodaman234/sounds/166507/ (concrete footstep 3), 0-0.42 s | Yoyodaman234 | CC0 | footfalls (low-passed, soft) |
| step-b.mp3 | https://freesound.org/people/VKProduktion/sounds/251788/ (Footstep 01.wav), 0.17-0.62 s | VKProduktion | CC0 | footfalls |
| step-c.mp3, step-d.mp3 | https://freesound.org/people/Stefan021/sounds/798870/ (Work boots on wood floor), 11.09-11.5 s and 4.23-4.65 s | Stefan021 | CC0 | footfalls |
| land-1.mp3 | https://freesound.org/people/kfatehi/sounds/363922/ (land.wav), 0-0.75 s | kfatehi | CC0 | landings, roster landings |
| swoosh-long.mp3 | https://freesound.org/people/freakinbehemoth/sounds/243400/ (woosh.wav), 0.35-1.3 s | freakinbehemoth | CC0 | dashes and big launches |
| grab-1.mp3 | https://freesound.org/people/alegemaate/sounds/667271/ (Cloth Grab), 0.1-0.45 s | alegemaate | CC0 | grabs, ledge catches, the shield's cloth |
| clock-tick.mp3 | https://freesound.org/people/abyeditsound/sounds/450509/ (ClockTickSound_01.wav), 1.13-1.45 s | abyeditsound | CC0 | the countdown, the last five seconds of a window, plan changes |
| lock-1.mp3 | https://freesound.org/people/randbsoundbites/sounds/791845/ (Locking or unlocking door), 0.25-1.05 s | randbsoundbites | CC0 | bets lock |

Made in code (no files): only shaping (filters, decay envelopes, playing a sample backwards for a
swell) and the reverb impulse response (`src/stage/audio/engine.ts`). No music is generated any
more: a phase whose recording cannot load is silent.

Removed for Blood Moon (files deleted): the two Kevin MacLeod loops "Metalmania" (music-fight) and
"Industrial Cinematic" (music-bed); the knockout explosions and boom (ko-blast-1, ko-blast-2,
ko-boom); the robots' colours (kiln-hiss, tick-ratchet, gantry-air, vise-press); the metal shield
ring (shield-1); the horns hit (show-horns); the electronic kick (kick); the cinematic impact
(impact-cine); the four melee swings (swing-1 to swing-4); and the arena crowd (crowd-bed,
crowd-cheer-bed, crowd-cheer, crowd-ooh, crowd-ooh2, crowd-roar).
