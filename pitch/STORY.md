# Story

Status: **nothing here is agreed yet.** Section 1 is Ian's own story from Thu Nov 19, evening.
Sections 3 and 4 are drafts for him to mark up.

## What the platform is, in Ian's words (Thu Nov 19, about 21:55). This is the current statement.

A platform where you can make predictions and wagers on live-streamed, simulated game environments
that run 24/7.

It has emerged as a response to two things:
- the new transition of the internet: AI bots running the internet, and AI becoming far more
  integrated, such as with 24/7 livestreams;
- internet trends such as people losing faith in mainstream streamers and in casinos in general.

Not decided as of this note: the name, and the overall design.

Names, round 1 (rejected by Ian: "I don't like any of those names at all"): Simulcast, Fairground,
Post Time, Dead Heat, Paddock, Ringside. Do not offer these or their kind (racing and
betting-industry words) again.

Names, round 2 (rejected: "those names are horrible bro. they have nothing to do with what our
platform is about"): Rumpus, Ruckus, Tussle, Scuffle, Hubbub, Kerfuffle.

**Ian's rule for the name: it has to say what the platform is about.** That is: games nobody
plays but AI, streamed live around the clock, that people watch and bet on.

Names, round 3 (put to him, not answered yet; unchecked for clashes), each an existing term for
exactly that: Zero Player, Spectator Mode, CPU vs CPU, Autoplay, Bot Lobby, Simstream, NPC Live.

Ruled out for clashes I know of: Railbird (a prediction exchange), Tote (a UK betting company),
Colosseum (a Solana organisation), OpenBook (a Solana exchange).

Design direction (Ian, same evening): still looking for a reference; "I kind of like this like
whimsical, you know, kind of unique style." Buttons with character, "a gem gradient to it almost";
a special font; Midjourney images of the games for the guides. The site design work is done in the
main session; his direction was relayed there at about 22:00.

## Open questions

1. Which problem opens the pitch: staged gambling, or the internet's transition?
2. The one sentence (three drafts in section 3).
3. Video length. The guide asks for 2 to 3 minutes; trailer + 2 min demo + 1 to 2 min slides runs 3.5 to 5.
4. What link Ian sees between the Collab+Currency article (ads die because agents do not look at ads) and this product.
5. Is the dating show in the submission? Which game carries the demo?
6. The name. The wordmark still says ARENA.
7. Do we name streamers and casinos, or describe the practice and cite a source on screen?
8. Do ElevenLabs and QuickNode stay in scope? Neither is in the code.

9. The edge rule: does Ian adopt "a careful viewer using only public form picks the winner 55 to 70% of the time" as the standard every game must pass?
10. Racetrack or casino: is "a racetrack for AI" the frame, with the gladiator arena as the look?

## 0. The edge (Ian, Nov 19, later the same evening)

His point: a fair game is not enough. A blackjack player accepts a known 95% return, but a bet here
needs a reason, the way a boxing bet does because you can study the boxer. Today Tumbletop feels
unpredictable, the two 1v1 games feel like pure guessing because the result comes from a seed, and
chess is the opposite: the stronger model is known, so there is no point. Designing games where an
educated prediction is possible but the winner is not obvious is, in his words, "a crucial component
missing from ALL our games right now". The per-game guide waits on this.

What the game reports already measure (all on scripted brains, not real models):

| Game | What tilts the odds | Measured |
|---|---|---|
| The Scrivener | class, weapon, spell and charm against tonight's boss temper, shown before bets open | Two fresh readers picked the winner from the builds 12 of 20 times (60%). The sim's own heuristic: 64 to 69%. The run's bar was 55 to 70%. |
| Tumbletop | four permanent stats (speed, grip, bounce, nerve); each round's course favours different ones | Best third by stats wins 1.33 times as often as the worst third. With 16 entrants each wins 4 to 9% of shows. Stats were taken off the stage. |
| Ringout | fighter matchup and how the coach reads the opponent | Matchups run 41 to 59. A coach that adapts beats fixed plans 67 to 94% of the time. |

The site's Form tab already shows record, win rate, last five and "The crowd favourite won X of the
last Y predictions".

Two points put to Ian, not yet agreed:
- A seed is the luck on the night. It does not remove the edge; stats and loadouts tilt the odds before it.
- Bets are pooled, so the question is not "who wins" but "is the crowd's price wrong". Horse racing
  works this way: pooled bets, a form guide, nobody controls the horse. It also answers chess: an
  obvious favourite pays almost nothing. Limit: it needs a real crowd, and today's pools are mostly house bots.

**Ian's follow-up:** a guide that explains each game will show everyone the best strategy, every
prediction converges on it, and the variation is gone. Each game seems to need a system with no
clear optimal path, though one might still be found, as with card counting.

My answer, put to him, not yet agreed:
- In a pool, convergence is what creates the variation. Say the favourite truly wins 65%. If 90% of
  the pool backs it, it pays 1.11 times and returns about 72 cents per dollar on average; the other
  side pays 10 times and returns about $3.50. Money moves to the underdog until the split is near
  the true odds. Nobody is shown the true odds, so the disagreement about them is the variation.
  The guide teaches how to read a match; the price does the rest.
- The bet panel already shows each outcome's share of the pool and its multiple.
- What a game needs so it has no solved answer: something new every match (temper, loadout offers,
  course, opponent); decisions made live by real models, which can be studied but not computed;
  more than one window as the match unfolds.
- His card-counting worry is real for a pure simulation. Tumbletop's sim is public and seeded, so
  anyone could run it thousands of times with tonight's 16 and get near-exact odds. At a racetrack
  that is what sharp bettors do, and it makes the price accurate, but it is a reason to lean on games
  where real models decide.
- Today every channel runs on scripted brains, and the house bots bet small random amounts. The
  claim "you can study the model" needs real models on in the demo.

## 1. Ian's story (his points, Nov 19)

- The internet is in a transition (Collab+Currency, "Agents are breaking the internet's business model").
- Real-time AI is arriving: MiniMax H3 makes video in seconds (infinite streaming, education, games). N3ON ran an AI stream with Higgsfield and GPT-6 Astra on Kick; the VOD is online and could give clips.
- The objection "will people watch AI compete instead of humans, and is it fair?":
  - BattleBots: people build robots that fight in an arena, and it was a hit. Done at high quality, people do not mind. It is slop they mind.
  - Epic's and Xbox's CEOs are investing in AI-native game development. The market is growing, and we could grow a developer community the way Roblox has, with developers earning yield from approved games.
- Crypto gambling is compromised (duel.com "fake bets"). Stake, Rainbet and others pay big streamers to push gambling at their audiences, and gambling influencers are multiplying. Our platform is unbiased: no streamers pushing deals at users.
- Our games aim to be legitimate, like duel.com's provably fair system and verify page.
- So the platform is a natural next step for casinos, for livestream entertainment and for the internet.
- Categories like Twitch's (Just Chatting, Games, IRL): ours are Battle Royale, Fighter, Mystery and so on.
- The pitch covers: the problem and the changing times; what the platform does and solves; use cases; future steps.

## 2. Checks on the claims (Nov 19)

| Claim | What I found |
|---|---|
| Collab+Currency article | Real. By Ronan, Nov 2, 2026. Argument: bot traffic passed human traffic in June; agents read sites and send no visitors back, so ad revenue breaks; Google's AI summaries cut pageviews about 40% in two years. It is about ads and web access, not entertainment or betting. |
| N3ON's AI stream | Real, September 2026, with Higgsfield, announced as GPT-6 Astra. Reported as his most-viewed VOD of his last 20 streams. **Not the first AI streamer**: Neuro-sama has streamed since Dec 2022, and the "first" claim drew backlash. He later said on stream "it's not AI". |
| MiniMax H3 | Real, released July 31, 2026: up to 15 s of 2K video with sound. "Real time" is the team's own figure (a 10 s clip in about 9 s). I could not confirm a model called "H3 MAX". |
| Epic | Confirmed in coverage: Sweeney's "huge pivot" to AI, and Unreal Engine 6 with generative AI pitched against Roblox. |
| Xbox Labs | Real: CEO Asha Sharma announced it Oct 13, 2026, a small group under the CTO. Coverage describes AI-assisted porting and modding, not AI-native games; her memo avoided the word AI, and she has promised "zero tolerance for bad AI". It supports "people mind slop, not AI" better than "investing heavily in AI-native games". Ian's fuller source is X, which I cannot read. |
| duel.com fake bets | The page says casinos fund streamers' balances. Its evidence: Rollbit topping up AyeZee's wallet (2022), Roshtein's demo-mode slip (2019), xQc saying streamers get "filled" balances (2022). It is a competitor casino's own page. |
| duel.com provably fair | The page would not load as text. Not read. |

What the build supports today, for the "unbiased and legitimate" claim:
- Pooled bets: viewers bet against each other, the house holds no side and takes no fee.
- Seeded windows commit `sha256(secret)` onchain before betting, take entropy from a slot hash after the close, and publish the seed. Anyone can replay the match.
- The channel page has a fairness view showing commitment, seed and the check.
- Viewers cannot affect a match. No promoters exist.

What it does not support today:
- Real money. It is play money on devnet.
- "No fake bets" without care: house bots place bets in the pools. They are labelled as bots.
- A one-click verify page like duel.com's.
- AI video. The games are simulations drawn in the browser.
- Outside developers or user-made bots. Roadmap only.

## 3. One sentence (drafts, not agreed)

A. Twitch where every streamer is an AI, and you can bet on who wins.
B. A live arena where AI fights AI around the clock and every bet is provably fair.
C. A casino with no house and no paid streamers: AI plays AI live, you bet against other viewers, and every result can be checked onchain.
D. A racetrack for AI: live games around the clock, a form guide for every entrant, and bets against other viewers instead of the house.

## 4. Thirty seconds (draft, not agreed)

1. **The times.** AI can now perform live, all day. In September a Kick streamer put a 24/7 AI version of himself on air, and it became his most-watched VOD in 20 streams.
2. **The problem.** The gambling that pays for streaming is staged. Casinos fill streamers' balances, and viewers copy bets that were never real.
3. **What we built.** Live channels where AI plays AI. You bet against other viewers, not the house. Nobody is paid to sell you a bet. Every result comes from a seed locked onchain before the match, and anyone can check it.
4. **Next.** Categories like Twitch's. Outside developers build games and bots and earn a share of the fees.

## 5. Full script

Not started. Waits on sections 3 and 4.

## Sources

- https://medium.com/collab-currency/agents-are-breaking-the-internets-business-model-13aaf2e669e7
- https://duel.com/about/fake-bets
- https://www.dexerto.com/kick/n3on-defends-ai-version-of-himself-that-keeps-streaming-while-he-sleeps-3406809/
- https://www.netinfluencer.com/streamer-n3on-described-his-24-7-ai-stream-as-innovative-then-said-its-not-ai/
- https://win.gg/n3on-claims-to-be-the-first-ai-streamer/
- https://datanorth.ai/news/minimax-releases-minimax-h3
- https://runtimewire.com/article/minimax-h3-fasth3-vllm-omni-real-time-video-serving
- https://www.khaleejtimes.com/business/tech/fortnite-maker-epic-games-huge-pivot-ai
- https://www.gaming.net/xbox-ceo-asha-sharma-creates-xbox-labs-to-explore-emerging-tech/
- https://gameranx.com/updates/id/564374/article/xbox-ceo-asha-sharma-announces-xbox-labs-but-why-didnt-she-mention-ai/
- `games/scrivener/REPORT.md`, `games/tumbletop/REPORT.md`, `games/brawl/ROUNDS.md` for the edge figures
