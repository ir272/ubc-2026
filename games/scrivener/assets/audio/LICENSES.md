# Audio licenses

Every shipped file in `assets/audio/` is listed below (each name ships as both `.ogg` and `.mp3`). Only CC0 and CC BY sources are used; no NC, ND, or personal-use-only material. Each license was read from the source page itself (Freesound sound page license link, Kenney asset page and bundled License.txt, incompetech's attribution notice).

All files are real recordings (field/foley/voice/instrument recordings, or Kevin MacLeod's produced music). Freesound items whose description said they were synthesised, AI-generated, built from unverifiable third-party sources, or derived from other CC BY sounds were dropped.

Processing applied to every file: segment selection, silence trim, fades, loudness normalisation (SFX toward -16 LUFS, mono; ambience/music -20 LUFS, stereo; true peak <= -1 dBTP; very short transients are capped at 6 dB of peak limiting so they may measure below -16 LUFS), and for `_loop` ambience an equal-power crossfade so the file loops seamlessly. Encodes: Ogg Vorbis q5 (libvorbis via libsndfile) and MP3 128 kbps (LAME). Originals are in `raw/` (Freesound items are the public HQ previews, since original downloads require a login).

## Attribution block (CC BY items: put this in the game's credits)

```
- "Whoosh Heavy Spear Hammer Large" by EminYILDIRIM (https://freesound.org/s/540300/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Longsword Swing 1 {Good edge alignment}" by Sophia_C (https://freesound.org/s/525166/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Whoosh+Sword_Hit Flesh.wav" by marb7e (https://freesound.org/s/620354/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Sword Stab  Body Hit" by -GeorgeDiamond- (https://freesound.org/s/718259/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "body-fall-5.wav" by CosmicEmbers (https://freesound.org/s/160742/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited (trimmed, loudness-normalised).
- "Warrior Death Cry - British Male" by theuncertainman (https://freesound.org/s/417539/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Fabric Swish" by harrietniamh (https://freesound.org/s/400351/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Monster 4.wav" by Sea Fury (https://freesound.org/s/48688/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited (trimmed, loudness-normalised).
- "Dragon Pain" by qubodup (https://freesound.org/s/219944/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Monster death throes 2" by giddster (https://freesound.org/s/464936/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Book, Flipping Through Pages, A.wav" by InspectorJ (https://freesound.org/s/416179/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "SIGNING PAPER SCRIBE WITH FOUNTAIN PEN QUILT SCRATCH IN STEREO" by ukjoncollins (https://freesound.org/s/441548/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Paper Scratch Pencil drawing line" by johannesschmidt (https://freesound.org/s/339741/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Book Slam.mp3" by sjnewton (https://freesound.org/s/256559/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited (trimmed, loudness-normalised).
- "Cathedral Bells, Close, A.wav" by InspectorJ (https://freesound.org/s/417769/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Heavy Rain" by lebaston100 (https://freesound.org/s/243629/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Howling Wind Loop" by qubodup (https://freesound.org/s/211610/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Wind On Door Short.wav" by Benboncan (https://freesound.org/s/84111/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Land of the Dead" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Halls of the Undead" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Oppressive Gloom" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Clash Defiant" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Final Count" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Truth of the Legend" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Corruption" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/
- "Gong.wav" by drumuse (https://freesound.org/s/51837/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Deepest Boom Yet" by hykenfreak (https://freesound.org/s/248150/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Movie Trailer Boom" by hykenfreak (https://freesound.org/s/207755/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "PotionDrinkLONG.wav" by Jamius (https://freesound.org/s/41529/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- "Drinking and swallow" by dersuperanton (https://freesound.org/s/433645/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).
- Sound effects also from Kenney (www.kenney.nl), CC0 — credit appreciated, not required.
```

## Per-file details


### heavy_blade_whoosh

**whoosh_heavy_spear_hammer.ogg / whoosh_heavy_spear_hammer.mp3**  
- Title: Whoosh Heavy Spear Hammer Large  
- Author: EminYILDIRIM  
- Source: https://freesound.org/people/EminYILDIRIM/sounds/540300/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/540300_whoosh_heavy_spear_hammer_large.ogg`  
- Required attribution: "Whoosh Heavy Spear Hammer Large" by EminYILDIRIM (https://freesound.org/s/540300/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**whoosh_heavy_low_swoosh.ogg / whoosh_heavy_low_swoosh.mp3**  
- Title: FX - Swoosh - Low Pitch  
- Author: bolkmar  
- Source: https://freesound.org/people/bolkmar/sounds/475135/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/475135_fx_swoosh_low_pitch.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "FX - Swoosh - Low Pitch" by bolkmar (https://freesound.org/people/bolkmar/sounds/475135/)

**whoosh_heavy_cardboard_swing.ogg / whoosh_heavy_cardboard_swing.mp3**  
- Title: Hard Swing 1  
- Author: magnuswaker  
- Source: https://freesound.org/people/magnuswaker/sounds/523230/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/523230_hard_swing_1.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Hard Swing 1" by magnuswaker (https://freesound.org/people/magnuswaker/sounds/523230/)

**whoosh_heavy_staff_pitched.ogg / whoosh_heavy_staff_pitched.mp3**  
- Title: Swinging staff whoosh (strong) 04.wav  
- Author: Nightflame  
- Source: https://freesound.org/people/Nightflame/sounds/422513/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/422513_swinging_staff_whoosh_strong_04_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Swinging staff whoosh (strong) 04.wav" by Nightflame (https://freesound.org/people/Nightflame/sounds/422513/)


### light_blade_whoosh

**whoosh_light_bamboo_sword.ogg / whoosh_light_bamboo_sword.mp3**  
- Title: swosh swinging sword 37.flac  
- Author: qubodup  
- Source: https://freesound.org/people/qubodup/sounds/60024/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/60024_swosh_swinging_sword_37_flac.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "swosh swinging sword 37.flac" by qubodup (https://freesound.org/people/qubodup/sounds/60024/)

**whoosh_light_cable_fast.ogg / whoosh_light_cable_fast.mp3**  
- Title: Clean fast Swoosh.aiff  
- Author: Danjocross  
- Source: https://freesound.org/people/Danjocross/sounds/507466/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/507466_clean_fast_swoosh_aiff.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Clean fast Swoosh.aiff" by Danjocross (https://freesound.org/people/Danjocross/sounds/507466/)

**whoosh_light_longsword_swing.ogg / whoosh_light_longsword_swing.mp3**  
- Title: Longsword Swing 1 {Good edge alignment}  
- Author: Sophia_C  
- Source: https://freesound.org/people/Sophia_C/sounds/525166/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/525166_longsword_swing_1_good_edge_alignment.ogg`  
- Required attribution: "Longsword Swing 1 {Good edge alignment}" by Sophia_C (https://freesound.org/s/525166/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**whoosh_light_foam_sword.ogg / whoosh_light_foam_sword.mp3**  
- Title: swing.mp3  
- Author: GaussTheWizard  
- Source: https://freesound.org/people/GaussTheWizard/sounds/367182/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/367182_swing_mp3.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "swing.mp3" by GaussTheWizard (https://freesound.org/people/GaussTheWizard/sounds/367182/)


### blade_impact_flesh

**hit_flesh_knife_stab_whoosh.ogg / hit_flesh_knife_stab_whoosh.mp3**  
- Title: Whoosh+Sword_Hit Flesh.wav  
- Author: marb7e  
- Source: https://freesound.org/people/marb7e/sounds/620354/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/620354_whoosh_sword_hit_flesh_wav.ogg`  
- Required attribution: "Whoosh+Sword_Hit Flesh.wav" by marb7e (https://freesound.org/s/620354/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**hit_flesh_sword_body.ogg / hit_flesh_sword_body.mp3**  
- Title: Sword hits the body.wav  
- Author: vdovitsky  
- Source: https://freesound.org/people/vdovitsky/sounds/411122/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/411122_sword_hits_the_body_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Sword hits the body.wav" by vdovitsky (https://freesound.org/people/vdovitsky/sounds/411122/)

**hit_flesh_large_stab.ogg / hit_flesh_large_stab.mp3**  
- Title: Large Swede Stab with Whoosh.wav  
- Author: minituffy  
- Source: https://freesound.org/people/minituffy/sounds/385966/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/385966_large_swede_stab_with_whoosh_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Large Swede Stab with Whoosh.wav" by minituffy (https://freesound.org/people/minituffy/sounds/385966/)

**hit_flesh_sword_stab_body.ogg / hit_flesh_sword_stab_body.mp3**  
- Title: Sword Stab  Body Hit  
- Author: -GeorgeDiamond-  
- Source: https://freesound.org/people/-GeorgeDiamond-/sounds/718259/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/718259_sword_stab_body_hit.ogg`  
- Required attribution: "Sword Stab  Body Hit" by -GeorgeDiamond- (https://freesound.org/s/718259/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### stone_slam

**slam_stone_heavy_throw.ogg / slam_stone_heavy_throw.mp3**  
- Title: impact-stone-heavy.wav  
- Author: kasparsj  
- Source: https://freesound.org/people/kasparsj/sounds/513694/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/513694_impact_stone_heavy_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "impact-stone-heavy.wav" by kasparsj (https://freesound.org/people/kasparsj/sounds/513694/)

**slam_debris_crash.ogg / slam_debris_crash.mp3**  
- Title: Fall debris (crash)  
- Author: xkeril  
- Source: https://freesound.org/people/xkeril/sounds/703248/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/703248_fall_debris_crash.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Fall debris (crash)" by xkeril (https://freesound.org/people/xkeril/sounds/703248/)

**slam_concrete_smash.ogg / slam_concrete_smash.mp3**  
- Title: Concrete SMASH 2  
- Author: magnuswaker  
- Source: https://freesound.org/people/magnuswaker/sounds/522099/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/522099_concrete_smash_2.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Concrete SMASH 2" by magnuswaker (https://freesound.org/people/magnuswaker/sounds/522099/)

**slam_heavy_body_ground.ogg / slam_heavy_body_ground.mp3**  
- Title: Dinosaur falls to the ground  
- Author: Breviceps  
- Source: https://freesound.org/people/Breviceps/sounds/457531/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/457531_dinosaur_falls_to_the_ground.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Dinosaur falls to the ground" by Breviceps (https://freesound.org/people/Breviceps/sounds/457531/)

**slam_stone_mining_hit.ogg / slam_stone_mining_hit.mp3**  
- Title: impactMining_000.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/impactMining_000.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)


### metal_clash_parry

**clash_sword_knives.ogg / clash_sword_knives.mp3**  
- Title: Sword clash 1.wav  
- Author: spycrah  
- Source: https://freesound.org/people/spycrah/sounds/471095/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/471095_sword_clash_1_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Sword clash 1.wav" by spycrah (https://freesound.org/people/spycrah/sounds/471095/)

**clash_sword_bright.ogg / clash_sword_bright.mp3**  
- Title: Sword Clash.wav  
- Author: Bird_man  
- Source: https://freesound.org/people/Bird_man/sounds/275159/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/275159_sword_clash_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Sword Clash.wav" by Bird_man (https://freesound.org/people/Bird_man/sounds/275159/)

**clash_sword_short.ogg / clash_sword_short.mp3**  
- Title: Sword_Clash (7).wav  
- Author: JohnBuhr  
- Source: https://freesound.org/people/JohnBuhr/sounds/326868/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/326868_sword_clash_7_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Sword_Clash (7).wav" by JohnBuhr (https://freesound.org/people/JohnBuhr/sounds/326868/)

**clash_metal_heavy_1.ogg / clash_metal_heavy_1.mp3**  
- Title: impactMetal_heavy_000.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/impactMetal_heavy_000.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)

**clash_metal_heavy_2.ogg / clash_metal_heavy_2.mp3**  
- Title: impactMetal_heavy_003.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/impactMetal_heavy_003.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)


### body_fall

**bodyfall_heavy_dirt.ogg / bodyfall_heavy_dirt.mp3**  
- Title: BODY FALL - V HVY - DIRT  
- Author: leonelmail  
- Source: https://freesound.org/people/leonelmail/sounds/504626/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/504626_body_fall_v_hvy_dirt.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "BODY FALL - V HVY - DIRT" by leonelmail (https://freesound.org/people/leonelmail/sounds/504626/)

**bodyfall_thud.ogg / bodyfall_thud.mp3**  
- Title: body-fall-5.wav  
- Author: CosmicEmbers  
- Source: https://freesound.org/people/CosmicEmbers/sounds/160742/  
- License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)  
- Original: `raw/freesound/160742_body_fall_5_wav.ogg`  
- Required attribution: "body-fall-5.wav" by CosmicEmbers (https://freesound.org/s/160742/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited (trimmed, loudness-normalised).

**bodyfall_floor.ogg / bodyfall_floor.mp3**  
- Title: Body fall_02.wav  
- Author: deleted_user_2104797  
- Source: https://freesound.org/people/deleted_user_2104797/sounds/346694/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/346694_body_fall_02_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Body fall_02.wav" by deleted_user_2104797 (https://freesound.org/people/deleted_user_2104797/sounds/346694/)


### player_hurt

**player_hurt_grunt_1.ogg / player_hurt_grunt_1.mp3**  
- Title: Voice_AdultMale_PainGrunts_09.wav  
- Author: MrFossy  
- Source: https://freesound.org/people/MrFossy/sounds/547209/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/547209_voice_adultmale_paingrunts_09_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Voice_AdultMale_PainGrunts_09.wav" by MrFossy (https://freesound.org/people/MrFossy/sounds/547209/)

**player_hurt_grunt_2.ogg / player_hurt_grunt_2.mp3**  
- Title: Grunt1 - Death Pain.wav  
- Author: tonsil5  
- Source: https://freesound.org/people/tonsil5/sounds/416839/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/416839_grunt1_death_pain_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Grunt1 - Death Pain.wav" by tonsil5 (https://freesound.org/people/tonsil5/sounds/416839/)

**player_hurt_grunt_3.ogg / player_hurt_grunt_3.mp3**  
- Title: male_hurt9.ogg  
- Author: micahlg  
- Source: https://freesound.org/people/micahlg/sounds/413186/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/413186_male_hurt9_ogg.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "male_hurt9.ogg" by micahlg (https://freesound.org/people/micahlg/sounds/413186/)


### player_death

**player_death_last_gasp.ogg / player_death_last_gasp.mp3**  
- Title: The Last gasp before death  
- Author: randbsoundbites  
- Source: https://freesound.org/people/randbsoundbites/sounds/798649/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/798649_the_last_gasp_before_death.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "The Last gasp before death" by randbsoundbites (https://freesound.org/people/randbsoundbites/sounds/798649/)

**player_death_warrior_groan.ogg / player_death_warrior_groan.mp3**  
- Title: Warrior Death Cry - British Male  
- Author: theuncertainman  
- Source: https://freesound.org/people/theuncertainman/sounds/417539/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/417539_warrior_death_cry_british_male.ogg`  
- Required attribution: "Warrior Death Cry - British Male" by theuncertainman (https://freesound.org/s/417539/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**player_death_cry.ogg / player_death_cry.mp3**  
- Title: Male Death Sound  
- Author: Blankened  
- Source: https://freesound.org/people/Blankened/sounds/554443/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/554443_male_death_sound.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Male Death Sound" by Blankened (https://freesound.org/people/Blankened/sounds/554443/)

**player_death_pain_grunt.ogg / player_death_pain_grunt.mp3**  
- Title: Grunt2 - Death Pain.wav  
- Author: tonsil5  
- Source: https://freesound.org/people/tonsil5/sounds/416838/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/416838_grunt2_death_pain_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Grunt2 - Death Pain.wav" by tonsil5 (https://freesound.org/people/tonsil5/sounds/416838/)


### footsteps_stone

**footstep_stone_1.ogg / footstep_stone_1.mp3**  
- Title: footstep_concrete_000.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/footstep_concrete_000.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)

**footstep_stone_2.ogg / footstep_stone_2.mp3**  
- Title: footstep_concrete_001.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/footstep_concrete_001.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)

**footstep_stone_3.ogg / footstep_stone_3.mp3**  
- Title: footstep_concrete_002.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/footstep_concrete_002.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)

**footstep_stone_4.ogg / footstep_stone_4.mp3**  
- Title: footstep_concrete_003.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/footstep_concrete_003.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)

**footstep_stone_5.ogg / footstep_stone_5.mp3**  
- Title: footstep_concrete_004.ogg (from 'Impact Sounds' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/impact-sounds  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/footstep_concrete_004.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)

**footstep_stone_boot_1.ogg / footstep_stone_boot_1.mp3**  
- Title: Hiking Boot Footsteps on Stone  
- Author: Fission9  
- Source: https://freesound.org/people/Fission9/sounds/521590/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/521590_hiking_boot_footsteps_on_stone.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Hiking Boot Footsteps on Stone" by Fission9 (https://freesound.org/people/Fission9/sounds/521590/)

**footstep_stone_boot_2.ogg / footstep_stone_boot_2.mp3**  
- Title: Hiking Boot Footsteps on Stone  
- Author: Fission9  
- Source: https://freesound.org/people/Fission9/sounds/521590/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/521590_hiking_boot_footsteps_on_stone.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Hiking Boot Footsteps on Stone" by Fission9 (https://freesound.org/people/Fission9/sounds/521590/)

**footstep_stone_boot_3.ogg / footstep_stone_boot_3.mp3**  
- Title: Hiking Boot Footsteps on Stone  
- Author: Fission9  
- Source: https://freesound.org/people/Fission9/sounds/521590/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/521590_hiking_boot_footsteps_on_stone.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Hiking Boot Footsteps on Stone" by Fission9 (https://freesound.org/people/Fission9/sounds/521590/)

**footsteps_stone_walk_loop.ogg / footsteps_stone_walk_loop.mp3**  
- Title: Dry Footsteps Loop  
- Author: qubodup  
- Source: https://freesound.org/people/qubodup/sounds/816017/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/816017_dry_footsteps_loop.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Dry Footsteps Loop" by qubodup (https://freesound.org/people/qubodup/sounds/816017/)


### roll_cloth_whoosh

**roll_fabric_swish.ogg / roll_fabric_swish.mp3**  
- Title: Fabric Swish  
- Author: harrietniamh  
- Source: https://freesound.org/people/harrietniamh/sounds/400351/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/400351_fabric_swish.ogg`  
- Required attribution: "Fabric Swish" by harrietniamh (https://freesound.org/s/400351/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**roll_shirt_whoosh.ogg / roll_shirt_whoosh.mp3**  
- Title: Shirt Whoosh 1.wav  
- Author: saturdaysoundguy  
- Source: https://freesound.org/people/saturdaysoundguy/sounds/391448/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/391448_shirt_whoosh_1_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Shirt Whoosh 1.wav" by saturdaysoundguy (https://freesound.org/people/saturdaysoundguy/sounds/391448/)

**roll_clothing_drag.ogg / roll_clothing_drag.mp3**  
- Title: Whoosh (Clothing Drag)  
- Author: JonasTisell  
- Source: https://freesound.org/people/JonasTisell/sounds/496188/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/496188_whoosh_clothing_drag.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Whoosh (Clothing Drag)" by JonasTisell (https://freesound.org/people/JonasTisell/sounds/496188/)

**roll_cloth_rustle.ogg / roll_cloth_rustle.mp3**  
- Title: cloth1.ogg (from 'RPG Audio' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/rpg-audio  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/cloth1.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)


### monster_roar

**monster_roar_demon_lion.ogg / monster_roar_demon_lion.mp3**  
- Title: Demon_Lion_Monster_Growl_Roar  
- Author: Manim8  
- Source: https://freesound.org/people/Manim8/sounds/469123/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/469123_demon_lion_monster_growl_roar.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Demon_Lion_Monster_Growl_Roar" by Manim8 (https://freesound.org/people/Manim8/sounds/469123/)

**monster_growl_deep.ogg / monster_growl_deep.mp3**  
- Title: Deep Monster Growl  
- Author: uagadugu  
- Source: https://freesound.org/people/uagadugu/sounds/222523/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/222523_deep_monster_growl.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Deep Monster Growl" by uagadugu (https://freesound.org/people/uagadugu/sounds/222523/)

**monster_roar_snarl.ogg / monster_roar_snarl.mp3**  
- Title: Monster 4.wav  
- Author: Sea Fury  
- Source: https://freesound.org/people/Sea%20Fury/sounds/48688/  
- License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)  
- Original: `raw/freesound/48688_monster_4_wav.ogg`  
- Required attribution: "Monster 4.wav" by Sea Fury (https://freesound.org/s/48688/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited (trimmed, loudness-normalised).

**monster_roar_long.ogg / monster_roar_long.mp3**  
- Title: Monster Roar 2.wav  
- Author: quadraslayer  
- Source: https://freesound.org/people/quadraslayer/sounds/398908/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/398908_monster_roar_2_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Monster Roar 2.wav" by quadraslayer (https://freesound.org/people/quadraslayer/sounds/398908/)


### monster_shriek

**monster_shriek_mutant.ogg / monster_shriek_mutant.mp3**  
- Title: Mutant Scream  
- Author: scorpion67890  
- Source: https://freesound.org/people/scorpion67890/sounds/396797/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/396797_mutant_scream.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Mutant Scream" by scorpion67890 (https://freesound.org/people/scorpion67890/sounds/396797/)

**monster_shriek_high.ogg / monster_shriek_high.mp3**  
- Title: monster shriek.ogg  
- Author: Darsycho  
- Source: https://freesound.org/people/Darsycho/sounds/442564/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/442564_monster_shriek_ogg.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "monster shriek.ogg" by Darsycho (https://freesound.org/people/Darsycho/sounds/442564/)

**monster_shriek_dragon_pain.ogg / monster_shriek_dragon_pain.mp3**  
- Title: Dragon Pain  
- Author: qubodup  
- Source: https://freesound.org/people/qubodup/sounds/219944/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/219944_dragon_pain.ogg`  
- Required attribution: "Dragon Pain" by qubodup (https://freesound.org/s/219944/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### monster_death

**monster_death_demon_choke.ogg / monster_death_demon_choke.mp3**  
- Title: Demon Dying 1.wav  
- Author: Osiruswaltz  
- Source: https://freesound.org/people/Osiruswaltz/sounds/362676/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/362676_demon_dying_1_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Demon Dying 1.wav" by Osiruswaltz (https://freesound.org/people/Osiruswaltz/sounds/362676/)

**monster_death_dying_breath.ogg / monster_death_dying_breath.mp3**  
- Title: Dragons Dying Breath  
- Author: MickBoere  
- Source: https://freesound.org/people/MickBoere/sounds/276577/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/276577_dragons_dying_breath.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Dragons Dying Breath" by MickBoere (https://freesound.org/people/MickBoere/sounds/276577/)

**monster_death_throes.ogg / monster_death_throes.mp3**  
- Title: Monster death throes 2  
- Author: giddster  
- Source: https://freesound.org/people/giddster/sounds/464936/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/464936_monster_death_throes_2.ogg`  
- Required attribution: "Monster death throes 2" by giddster (https://freesound.org/s/464936/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**monster_death_wail.ogg / monster_death_wail.mp3**  
- Title: dying monster.wav  
- Author: rezidentevil  
- Source: https://freesound.org/people/rezidentevil/sounds/396046/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/396046_dying_monster_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "dying monster.wav" by rezidentevil (https://freesound.org/people/rezidentevil/sounds/396046/)

**monster_death_groan.ogg / monster_death_groan.mp3**  
- Title: monster_dying.wav  
- Author: vox_artist  
- Source: https://freesound.org/people/vox_artist/sounds/513621/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/513621_monster_dying_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "monster_dying.wav" by vox_artist (https://freesound.org/people/vox_artist/sounds/513621/)


### paper_rustle_tear

**paper_tear_single.ogg / paper_tear_single.mp3**  
- Title: tearing paper4.wav  
- Author: keweldog  
- Source: https://freesound.org/people/keweldog/sounds/181773/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/181773_tearing_paper4_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "tearing paper4.wav" by keweldog (https://freesound.org/people/keweldog/sounds/181773/)

**paper_rip.ogg / paper_rip.mp3**  
- Title: Paper Ripping  
- Author: EminYILDIRIM  
- Source: https://freesound.org/people/EminYILDIRIM/sounds/535361/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/535361_paper_ripping.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Paper Ripping" by EminYILDIRIM (https://freesound.org/people/EminYILDIRIM/sounds/535361/)

**paper_pages_flip.ogg / paper_pages_flip.mp3**  
- Title: Book, Flipping Through Pages, A.wav  
- Author: InspectorJ  
- Source: https://freesound.org/people/InspectorJ/sounds/416179/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/416179_book_flipping_through_pages_a_wav.ogg`  
- Required attribution: "Book, Flipping Through Pages, A.wav" by InspectorJ (https://freesound.org/s/416179/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**paper_rustle.ogg / paper_rustle.mp3**  
- Title: rustling paper.wav  
- Author: keweldog  
- Source: https://freesound.org/people/keweldog/sounds/181774/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/181774_rustling_paper_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "rustling paper.wav" by keweldog (https://freesound.org/people/keweldog/sounds/181774/)

**paper_page_turn.ogg / paper_page_turn.mp3**  
- Title: Page Turn  
- Author: davidbain  
- Source: https://freesound.org/people/davidbain/sounds/136778/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/136778_page_turn.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Page Turn" by davidbain (https://freesound.org/people/davidbain/sounds/136778/)

**paper_book_flip.ogg / paper_book_flip.mp3**  
- Title: bookFlip1.ogg (from 'RPG Audio' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/rpg-audio  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/bookFlip1.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)


### quill_scratch

**quill_scratch_pencil_scribble.ogg / quill_scratch_pencil_scribble.mp3**  
- Title: Scribble  
- Author: Tomoyo Ichijouji  
- Source: https://freesound.org/people/Tomoyo%20Ichijouji/sounds/211247/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/211247_scribble.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Scribble" by Tomoyo Ichijouji (https://freesound.org/people/Tomoyo%20Ichijouji/sounds/211247/)

**quill_scratch_scribble.ogg / quill_scratch_scribble.mp3**  
- Title: scribble.mp3  
- Author: indigosierra  
- Source: https://freesound.org/people/indigosierra/sounds/82610/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/82610_scribble_mp3.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "scribble.mp3" by indigosierra (https://freesound.org/people/indigosierra/sounds/82610/)

**quill_scratch_fountain_pen_1.ogg / quill_scratch_fountain_pen_1.mp3**  
- Title: SIGNING PAPER SCRIBE WITH FOUNTAIN PEN QUILT SCRATCH IN STEREO  
- Author: ukjoncollins  
- Source: https://freesound.org/people/ukjoncollins/sounds/441548/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/441548_signing_paper_scribe_with_fountain_pen_q.ogg`  
- Required attribution: "SIGNING PAPER SCRIBE WITH FOUNTAIN PEN QUILT SCRATCH IN STEREO" by ukjoncollins (https://freesound.org/s/441548/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**quill_scratch_fountain_pen_2.ogg / quill_scratch_fountain_pen_2.mp3**  
- Title: SIGNING PAPER SCRIBE WITH FOUNTAIN PEN QUILT SCRATCH IN STEREO  
- Author: ukjoncollins  
- Source: https://freesound.org/people/ukjoncollins/sounds/441548/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/441548_signing_paper_scribe_with_fountain_pen_q.ogg`  
- Required attribution: "SIGNING PAPER SCRIBE WITH FOUNTAIN PEN QUILT SCRATCH IN STEREO" by ukjoncollins (https://freesound.org/s/441548/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**quill_scratch_line.ogg / quill_scratch_line.mp3**  
- Title: Paper Scratch Pencil drawing line  
- Author: johannesschmidt  
- Source: https://freesound.org/people/johannesschmidt/sounds/339741/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/339741_paper_scratch_pencil_drawing_line.ogg`  
- Required attribution: "Paper Scratch Pencil drawing line" by johannesschmidt (https://freesound.org/s/339741/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### book_slam

**book_slam_shut.ogg / book_slam_shut.mp3**  
- Title: Book slamming shut 1  
- Author: zmobie  
- Source: https://freesound.org/people/zmobie/sounds/319809/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/319809_book_slamming_shut_1.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Book slamming shut 1" by zmobie (https://freesound.org/people/zmobie/sounds/319809/)

**book_snap_shut.ogg / book_snap_shut.mp3**  
- Title: book_snap_shut.wav  
- Author: j1987  
- Source: https://freesound.org/people/j1987/sounds/573198/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/573198_book_snap_shut_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "book_snap_shut.wav" by j1987 (https://freesound.org/people/j1987/sounds/573198/)

**book_slam_hard.ogg / book_slam_hard.mp3**  
- Title: Book Slam.mp3  
- Author: sjnewton  
- Source: https://freesound.org/people/sjnewton/sounds/256559/  
- License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)  
- Original: `raw/freesound/256559_book_slam_mp3.ogg`  
- Required attribution: "Book Slam.mp3" by sjnewton (https://freesound.org/s/256559/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Edited (trimmed, loudness-normalised).

**book_close_kenney.ogg / book_close_kenney.mp3**  
- Title: bookClose.ogg (from 'RPG Audio' pack)  
- Author: Kenney (Kenney Vleugels, kenney.nl)  
- Source: https://kenney.nl/assets/rpg-audio  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/kenney/bookClose.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: Kenney (www.kenney.nl)


### bell_toll

**bell_toll_large.ogg / bell_toll_large.mp3**  
- Title: TollBell.wav  
- Author: daytripper  
- Source: https://freesound.org/people/daytripper/sounds/73678/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/73678_tollbell_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "TollBell.wav" by daytripper (https://freesound.org/people/daytripper/sounds/73678/)

**bell_toll_funeral.ogg / bell_toll_funeral.mp3**  
- Title: funeral bell-cloche funèbre.wav  
- Author: aoristos  
- Source: https://freesound.org/people/aoristos/sounds/329324/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/329324_funeral_bell_cloche_fun_bre_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "funeral bell-cloche funèbre.wav" by aoristos (https://freesound.org/people/aoristos/sounds/329324/)

**bell_cathedral_peal.ogg / bell_cathedral_peal.mp3**  
- Title: Cathedral Bells, Close, A.wav  
- Author: InspectorJ  
- Source: https://freesound.org/people/InspectorJ/sounds/417769/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/417769_cathedral_bells_close_a_wav.ogg`  
- Required attribution: "Cathedral Bells, Close, A.wav" by InspectorJ (https://freesound.org/s/417769/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### rain_wind_ambience

**amb_wind_rain_storm_loop.ogg / amb_wind_rain_storm_loop.mp3**  
- Title: Wind and rain in Iceland_48Khz_Ms  
- Author: bashrambali  
- Source: https://freesound.org/people/bashrambali/sounds/448196/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/448196_wind_and_rain_in_iceland_48khz_ms.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Wind and rain in Iceland_48Khz_Ms" by bashrambali (https://freesound.org/people/bashrambali/sounds/448196/)

**amb_heavy_rain_loop.ogg / amb_heavy_rain_loop.mp3**  
- Title: Heavy Rain  
- Author: lebaston100  
- Source: https://freesound.org/people/lebaston100/sounds/243629/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/243629_heavy_rain.ogg`  
- Required attribution: "Heavy Rain" by lebaston100 (https://freesound.org/s/243629/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**amb_howling_wind_loop.ogg / amb_howling_wind_loop.mp3**  
- Title: Howling Wind Loop  
- Author: qubodup  
- Source: https://freesound.org/people/qubodup/sounds/211610/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/211610_howling_wind_loop.ogg`  
- Required attribution: "Howling Wind Loop" by qubodup (https://freesound.org/s/211610/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**amb_rain_thunder_loop.ogg / amb_rain_thunder_loop.mp3**  
- Title: Rain and Thunder Ambience  
- Author: sagamusix  
- Source: https://freesound.org/people/sagamusix/sounds/700358/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/700358_rain_and_thunder_ambience.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Rain and Thunder Ambience" by sagamusix (https://freesound.org/people/sagamusix/sounds/700358/)

**amb_wind_door_rain_loop.ogg / amb_wind_door_rain_loop.mp3**  
- Title: Wind On Door Short.wav  
- Author: Benboncan  
- Source: https://freesound.org/people/Benboncan/sounds/84111/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/84111_wind_on_door_short_wav.ogg`  
- Required attribution: "Wind On Door Short.wav" by Benboncan (https://freesound.org/s/84111/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### choir_drone_music

**music_drone_land_of_the_dead.ogg / music_drone_land_of_the_dead.mp3**  
- Title: Land of the Dead  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100179  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Land_of_the_Dead.mp3`  
- Required attribution: "Land of the Dead" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

**music_drone_halls_of_the_undead.ogg / music_drone_halls_of_the_undead.mp3**  
- Title: Halls of the Undead  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100355  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Halls_of_the_Undead.mp3`  
- Required attribution: "Halls of the Undead" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

**music_drone_oppressive_gloom.ogg / music_drone_oppressive_gloom.mp3**  
- Title: Oppressive Gloom  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100885  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Oppressive_Gloom.mp3`  
- Required attribution: "Oppressive Gloom" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

**drone_dark_choir_loop.ogg / drone_dark_choir_loop.mp3**  
- Title: Dark Choir Singing  
- Author: BrainClaim  
- Source: https://freesound.org/people/BrainClaim/sounds/273804/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/273804_dark_choir_singing.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Dark Choir Singing" by BrainClaim (https://freesound.org/people/BrainClaim/sounds/273804/)

**drone_humming_choir_loop.ogg / drone_humming_choir_loop.mp3**  
- Title: Humming in F# Minor  
- Author: xkeril  
- Source: https://freesound.org/people/xkeril/sounds/685680/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/685680_humming_in_f_minor.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Humming in F# Minor" by xkeril (https://freesound.org/people/xkeril/sounds/685680/)


### boss_music

**music_boss_clash_defiant.ogg / music_boss_clash_defiant.mp3**  
- Title: Clash Defiant  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600003  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Clash_Defiant.mp3`  
- Required attribution: "Clash Defiant" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

**music_boss_final_count.ogg / music_boss_final_count.mp3**  
- Title: Final Count  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100657  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Final_Count.mp3`  
- Required attribution: "Final Count" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

**music_boss_truth_of_the_legend.ogg / music_boss_truth_of_the_legend.mp3**  
- Title: Truth of the Legend  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100592  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Truth_of_the_Legend.mp3`  
- Required attribution: "Truth of the Legend" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/

**music_boss_corruption.ogg / music_boss_corruption.mp3**  
- Title: Corruption  
- Author: Kevin MacLeod  
- Source: https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600004  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/incompetech/Corruption.mp3`  
- Required attribution: "Corruption" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/


### ui_death_sting

**sting_death_gong.ogg / sting_death_gong.mp3**  
- Title: gong.WAV  
- Author: BOSS MUSIC  
- Source: https://freesound.org/people/BOSS%20MUSIC/sounds/121800/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/121800_gong_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "gong.WAV" by BOSS MUSIC (https://freesound.org/people/BOSS%20MUSIC/sounds/121800/)

**sting_death_tamtam.ogg / sting_death_tamtam.mp3**  
- Title: Gong.wav  
- Author: drumuse  
- Source: https://freesound.org/people/drumuse/sounds/51837/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/51837_gong_wav.ogg`  
- Required attribution: "Gong.wav" by drumuse (https://freesound.org/s/51837/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**sting_death_bass_drum_boom.ogg / sting_death_bass_drum_boom.mp3**  
- Title: Deepest Boom Yet  
- Author: hykenfreak  
- Source: https://freesound.org/people/hykenfreak/sounds/248150/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/248150_deepest_boom_yet.ogg`  
- Required attribution: "Deepest Boom Yet" by hykenfreak (https://freesound.org/s/248150/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**sting_death_trailer_boom.ogg / sting_death_trailer_boom.mp3**  
- Title: Movie Trailer Boom  
- Author: hykenfreak  
- Source: https://freesound.org/people/hykenfreak/sounds/207755/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/207755_movie_trailer_boom.ogg`  
- Required attribution: "Movie Trailer Boom" by hykenfreak (https://freesound.org/s/207755/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### heal_drink

**heal_drink_gulp.ogg / heal_drink_gulp.mp3**  
- Title: Drink / Drinking liquid  
- Author: Breviceps  
- Source: https://freesound.org/people/Breviceps/sounds/445970/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/445970_drink_drinking_liquid.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Drink / Drinking liquid" by Breviceps (https://freesound.org/people/Breviceps/sounds/445970/)

**heal_potion_swallow.ogg / heal_potion_swallow.mp3**  
- Title: Potion - drink - swallow.wav  
- Author: ValentinPetiteau  
- Source: https://freesound.org/people/ValentinPetiteau/sounds/574077/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/574077_potion_drink_swallow_wav.ogg`  
- Required attribution: Not required (CC0). Optional courtesy credit: "Potion - drink - swallow.wav" by ValentinPetiteau (https://freesound.org/people/ValentinPetiteau/sounds/574077/)

**heal_potion_drink.ogg / heal_potion_drink.mp3**  
- Title: PotionDrinkLONG.wav  
- Author: Jamius  
- Source: https://freesound.org/people/Jamius/sounds/41529/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/41529_potiondrinklong_wav.ogg`  
- Required attribution: "PotionDrinkLONG.wav" by Jamius (https://freesound.org/s/41529/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).

**heal_drink_swallow.ogg / heal_drink_swallow.mp3**  
- Title: Drinking and swallow  
- Author: dersuperanton  
- Source: https://freesound.org/people/dersuperanton/sounds/433645/  
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)  
- Original: `raw/freesound/433645_drinking_and_swallow.ogg`  
- Required attribution: "Drinking and swallow" by dersuperanton (https://freesound.org/s/433645/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited (trimmed, loudness-normalised).


### impulse_response

**ir_church_stone_hall.ogg / ir_church_stone_hall.mp3**  
- Title: notredamenyc2014impulseresponse_01.flac  
- Author: pushkin  
- Source: https://freesound.org/people/pushkin/sounds/240593/  
- License: [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)  
- Original: `raw/freesound/240593_notredamenyc2014impulseresponse_01.ogg`  
- Recording: a real acoustic impulse response of a stone church (stereo X/Y pair, per the source page). Used as the hall reverb (WebAudio ConvolverNode); edited: direct arrival removed (early reflections kept), trimmed to 3.0 s with a 0.9 s fade, 70 Hz high-pass, peak-normalised, stereo.  
- Required attribution: Not required (CC0). Optional courtesy credit: "notredamenyc2014impulseresponse_01.flac" by pushkin (https://freesound.org/people/pushkin/sounds/240593/)
