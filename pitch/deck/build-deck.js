// Pitch deck for the UBC 2026 submission video. Output: pitch/deck/arena-pitch.pptx
// (opens in Google Slides: upload to Drive, then File > Save as Google Slides).
// Look: the Twitch light values already measured in web/src/themes/look.tsx, Inter, no accent colour.
// `node build-deck.js` builds the deck; `node build-deck.js --only N` builds one slide for checking.
const pptxgen = require("pptxgenjs");
const path = require("path");
const SKILL = "/Users/ianroybal/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/71d86c63-f350-40be-b503-b157ee6928c9/724e2cbf-0730-4ebf-a191-9b7d30f4cbf8/skills/pptx";
const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));

const NAME = "ARENA"; // placeholder until Ian picks the name
const PROGRAM_ID = "GGQeGU8BTtRDmHPoC25Py185wEuUeDz3phXWG4Gp6z2P";
const only = process.argv.includes("--only") ? Number(process.argv[process.argv.indexOf("--only") + 1]) : 0;
const OUT = only ? `qa/slide-${String(only).padStart(2, "0")}.pptx` : "arena-pitch.pptx";

const THEME = {
  name: "Arena light",
  headFontFace: process.env.DECK_FONT || "Inter",
  bodyFontFace: process.env.DECK_FONT || "Inter",
  colors: {
    dk1: "0E0E10", lt1: "F7F7F8", dk2: "3B3B44", lt2: "FFFFFF",
    accent1: "53535F", accent2: "E2E2E6", accent3: "E6E6EA", accent4: "4558FF", accent5: "E91916", accent6: "0B62C4",
    hlink: "4558FF", folHlink: "53535F",
  },
};

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = `${NAME} pitch`;
  const C = pres.SchemeColor;
  const INK = C.text1, INK2 = C.text2, MUTED = C.accent1, LINE = C.accent2, FRAME = C.accent3, PAGE = C.background1, CARD = C.background2;

  const TITLE = { x: 0.5, y: 0.42, w: 9.0, h: 0.62, fontSize: 26, bold: true, color: INK, align: "left", valign: "middle", margin: 0 };
  pres.defineSlideMaster({
    title: "Cover", background: { color: PAGE },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 1.75, w: 9.0, h: 1.0, fontSize: 60, bold: true, color: INK, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.5, y: 2.85, w: 7.2, h: 0.9, fontSize: 18, color: INK2, align: "left", valign: "top", margin: 0, bullet: false }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "Content", background: { color: PAGE },
    objects: [{ placeholder: { options: { name: "title", type: "title", ...TITLE }, text: "" } }],
  });

  let n = 0;
  const add = (master, build) => {
    n += 1;
    if (only && n !== only) return;
    build(pres.addSlide({ masterName: master }));
  };
  const source = (s, text) => s.addText(text, { x: 0.5, y: 5.05, w: 9.0, h: 0.28, fontSize: 10, color: MUTED, margin: 0, isTextBox: true, objectName: "Source" });
  // One media frame, same place on every slide that has one: x 4.0, y 1.3, 5.5 x 3.09 in (16:9).
  // Overlays in the edit go exactly here.
  const M = { x: 4.0, y: 1.3, w: 5.5, h: 3.09375 };
  const L = { x: 0.5, y: 1.3, w: 3.25 };
  const points = (s, lines) =>
    s.addText(lines.map((t, i) => ({ text: t, options: { breakLine: i < lines.length - 1, paraSpaceAfter: 12 } })),
      { ...L, h: 3.3, fontSize: 16, color: INK2, valign: "top", margin: 0, isTextBox: true, objectName: "Points" });
  const steps = (s, items) => {
    const runs = [];
    items.forEach(([head, body], i) => {
      runs.push({ text: `${i + 1}  ${head}`, options: { fontSize: 15, bold: true, color: INK, breakLine: true } });
      runs.push({ text: body, options: { fontSize: 14, color: INK2, breakLine: i < items.length - 1, paraSpaceAfter: 10 } });
    });
    s.addText(runs, { ...L, h: 3.5, valign: "top", margin: 0, isTextBox: true, objectName: "Steps" });
  };
  const frame = (s, label) => {
    s.addShape(pres.ShapeType.rect, { ...M, fill: { color: FRAME }, line: { color: THEME.colors.accent2, width: 0.75 }, objectName: "Media frame" });
    s.addText(label, { ...M, fontSize: 11, color: MUTED, align: "center", valign: "middle", isTextBox: true, objectName: "Media frame label" });
  };
  const cards = (s, items, y = 1.5, h = 2.9) => {
    const gap = 0.2, w = (9.0 - gap * (items.length - 1)) / items.length;
    items.forEach(([head, body], i) => {
      const x = 0.5 + i * (w + gap);
      s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: CARD }, line: { color: THEME.colors.accent2, width: 0.75 }, objectName: `Card ${i + 1}` });
      s.addText(head, { x: x + 0.22, y: y + 0.25, w: w - 0.44, h: 0.62, fontSize: 17, bold: true, color: INK, valign: "top", margin: 0, isTextBox: true, objectName: `Card ${i + 1} head` });
      if (body) s.addText(body, { x: x + 0.22, y: y + 0.93, w: w - 0.44, h: h - 1.1, fontSize: 14, color: INK2, valign: "top", margin: 0, isTextBox: true, objectName: `Card ${i + 1} body` });
    });
  };

  // 1. Cover
  add("Cover", (s) => {
    s.addText(NAME, { placeholder: "title" });
    s.addText("Live channels where AI plays AI, around the clock. Viewers bet on the outcome.", { placeholder: "body" });
    s.addText("UBC 2026 Hackathon  ·  Consumer track  ·  Built on Solana", { x: 0.5, y: 5.05, w: 9.0, h: 0.28, fontSize: 11, color: MUTED, margin: 0, isTextBox: true, objectName: "Footer" });
    s.addNotes(`${NAME} is a placeholder name. Change it here and on slides 3 and 10.`);
  });

  // 2. Setting the stage, in one slide: dead internet + 24/7 AI livestreams + losing faith, with both pictures
  add("Content", (s) => {
    s.addText("The dead internet theory is no longer a theory", { placeholder: "title" });
    s.addText([
      { text: "57%", options: { bold: true, color: INK } },
      { text: " of web traffic is now bots. Cloudflare's CEO projects 1,000× human traffic within five years.", options: { color: INK2 } },
    ], { x: 0.5, y: 1.08, w: 9.0, h: 0.36, fontSize: 15, valign: "middle", margin: 0, isTextBox: true, objectName: "Stat line" });
    const PW = 4.4, PH = PW * 9 / 16, PY = 2.2;
    const heading = (x, head, name) => s.addText(head, { x, y: 1.55, w: PW, h: 0.56, fontSize: 15, bold: true, color: INK, valign: "bottom", margin: 0, isTextBox: true, objectName: `${name} heading` });
    // Left: the stream clip with the reaction posts popping on and stacking (a video, 8 s).
    heading(0.5, "24/7 AI livestreams are here", "Stream video");
    s.addMedia({ type: "video", path: "img/stream-reactions.mp4", x: 0.5, y: PY, w: PW, h: PH,
      cover: "image/png;base64," + require("fs").readFileSync("img/stream-reactions-poster.png").toString("base64"), objectName: "Stream and reactions video" });
    // Right: the two images Ian supplied for the losing-faith part, side by side, each with a one-line caption.
    heading(5.1, "People are losing faith in traditional streamers", "Losing faith");
    const shot = (x, w, img, iw, ih, cap, alt, name) => {
      const h = w * ih / iw;
      s.addImage({ path: img, x, y: PY, w, h, altText: alt, objectName: name });
      s.addText(cap, { x, y: PY + h + 0.08, w, h: 0.5, fontSize: 11, color: INK2, valign: "top", margin: 0, isTextBox: true, objectName: `${name} caption` });
    };
    shot(5.1, 1.95, "img/xqc-fake-balances.jpg", 1170, 1022, "xQc, 2022: streamers get \"filled\" balances.", "A clip page titled: xQc admits some streamers get fake gambling balances from their sponsors", "xQc clip");
    shot(7.15, 2.35, "img/rollbit-slot-stream.png", 1246, 705, "2022: Rollbit was topping up AyeZee's wallet to gamble with.", "A slot game on Rollbit being played on a stream, credit 574,624 dollars", "Rollbit stream");
    source(s, "Cloudflare, June and September 2026.  Dexerto, September 2026.  duel.com/about/fake-bets.");
    s.addNotes("Opening line (Ian): \"the dead internet theory is no longer a theory...\"\nThen: the N3ON livestream shows the emergence of 24/7 simulations and livestreams. Then the controversial reactions: people are losing faith in traditional streamers and online casinos.\nFacts: Cloudflare's CEO announced June 3, 2026 that bots had passed humans in web traffic, about 57% to 43% of page requests; in September he projected automated traffic at a thousand times human traffic within five years. N3ON's 24/7 AI stream launched September 2026 and was reported as his most-viewed VOD in 20 streams (he was not the first AI streamer). duel.com's Fake Bets page says casinos fill streamers' balances.\nLeft: an 8 s video. The N3ON clip plays alone for 4 s, then the reaction posts pop on faster and faster, and it zooms in close on the last one, Confirms dead internet theory, which is circled in red. Right: the two images Ian supplied. Quotes he supplied with them, both from duel.com's Fake Bets page: \"In 2022, a blockchain investigation found that Rollbit had regularly been topping up AyeZee's wallet to gamble with - it wasn't his own money. The video was eventually taken down after multiple copyright claims.\" and \"In 2022, Kick streamer xQc admitted that many streamers get 'filled' balances and have their losses covered by the casino.\" The clip page itself says \"some streamers\".");
  });

  // Slides 3 to 6 are ordinary full slides. The platform is a SEPARATE recording; in the edit the
  // slide recording and the platform recording are shown side by side. Nothing on these slides is
  // reserved for it. Type is large because the slide is seen at about half the screen.
  const SIDE = "In the edit this slide's recording and the separate platform recording are shown side by side.";
  const bigPoints = (s, lines) =>
    s.addText(lines.map((t, i) => ({ text: t, options: { breakLine: i < lines.length - 1, paraSpaceAfter: 18 } })),
      { x: 0.5, y: 1.5, w: 9.0, h: 3.2, fontSize: 24, color: INK2, valign: "top", margin: 0, isTextBox: true, objectName: "Points" });
  const grid = (s, items) => {
    const W = 4.3, GX = 0.4, RH = 1.6;
    items.forEach(([head, body], i) => {
      const x = 0.5 + (i % 2) * (W + GX), y = 1.5 + Math.floor(i / 2) * RH;
      s.addText([
        { text: `${i + 1}  ${head}`, options: { fontSize: 24, bold: true, color: INK, breakLine: true } },
        { text: body, options: { fontSize: 19, color: INK2 } },
      ], { x, y, w: W, h: RH - 0.15, valign: "top", margin: 0, isTextBox: true, objectName: `Step ${i + 1}` });
    });
  };

  // 3. The platform
  add("Content", (s) => {
    s.addText(`${NAME}: AI plays AI, live, around the clock`, { placeholder: "title" });
    bigPoints(s, ["Live channels by category, like Twitch.", "No streamer and no promoter.", "Nobody is paid to sell you a bet."]);
    s.addNotes(`${SIDE}\nDelete this slide if you want to go straight to How it works.`);
  });

  // 4. How it works
  add("Content", (s) => {
    s.addText("How it works", { placeholder: "title" });
    grid(s, [
      ["Open the site", "No sign-in, no wallet, $1,000 of play money."],
      ["Read the match", "Records, loadouts and form."],
      ["Bet against the crowd", "Not against the house."],
      ["Get paid", "Winners split the pool."],
    ]);
    s.addNotes(`${SIDE}\nPlatform recording at this point: arriving on the site, the Form tab, placing a bet, the payout. Play money on devnet today.`);
  });

  // 5. Solana
  add("Content", (s) => {
    s.addText("Built on Solana", { placeholder: "title" });
    bigPoints(s, ["Every bet is a Solana transaction the viewer never sees.", "One program holds every pool and pays every winner.", "We pay the network fees."]);
    source(s, `Program on devnet: ${PROGRAM_ID}`);
    s.addNotes(`${SIDE}\nThe site makes a wallet silently in the browser; the runner pays the fee for each bet. Pooled (parimutuel) markets, 2 to 16 outcomes each.\nPlatform recording at this point: a bet, then its transaction on a Solana explorer.`);
  });

  // 6. Fairness
  add("Content", (s) => {
    s.addText("Provably fair", { placeholder: "title" });
    grid(s, [
      ["Commit", "A seed's hash goes onchain before betting."],
      ["Close", "Betting closes at a set slot."],
      ["Mix", "Chain randomness is added after the close."],
      ["Reveal", "Anyone can replay the match."],
    ]);
    s.addNotes(`${SIDE}\nSeed = sha256(secret, slot hash after close, market address). Nobody chooses the randomness.\nPlatform recording at this point: the Fair play tab (commitment, seed, the check).`);
  });

  // 7. What comes next: AI game development
  add("Content", (s) => {
    s.addText("AI game development is taking off", { placeholder: "title" });
    const h = 3.4, y = 1.4;
    s.addImage({ path: "img/sweeney.png", x: 0.9, y, w: h * 1326 / 1186, h, altText: "Tim Sweeney on X, Oct 12, 2026: a huge pivot underway at Epic to retool for maximum AI acceleration", objectName: "Sweeney post" });
    s.addImage({ path: "img/xbox.png", x: 5.4, y, w: h * 1320 / 1222, h, altText: "A post quoting Kalshi, Oct 15, 2026: Xbox CEO creates a new team to study recreating games inside other games with AI", objectName: "Xbox post" });
    source(s, "Tim Sweeney on X, Oct 12, 2026.  Kalshi on X, Oct 15, 2026.");
    s.addNotes("Part of the what-comes-next section. Epic: Sweeney's own post. Xbox: this is Kalshi's summary quoted by another account, not Xbox's own words. Swap in the Xbox CEO's own post if you have it.");
  });

  // 8. What comes next: roadmap
  add("Content", (s) => {
    s.addText("What comes next", { placeholder: "title" });
    cards(s, [
      ["More categories", "Battle Royale, Fighter, Mystery and more."],
      ["Outside developers", "Developers build games and earn from the ones we approve."],
      ["User-made bots", "Build a bot, earn a share of fees when others bet on it. Needs sandboxing and review first."],
      ["Real stakes", "Today it is play money on devnet."],
    ], 1.5, 2.9);
    s.addNotes("User-made bots and outside developers are roadmap, not built. The security work (sandboxing, review, limits) comes first.");
  });

  // 9. Summary
  add("Content", (s) => {
    s.addText("In summary", { placeholder: "title" });
    cards(s, [
      ["Not a traditional online casino", "No house side, and no casino money pumped to streamers."],
      ["We are builders", "We build the games."],
      ["In line with where the internet is going", ""],
    ], 1.5, 2.3);
    s.addNotes("Ian's three closing points.");
  });

  // 10. Contact
  add("Cover", (s) => {
    s.addText(NAME, { placeholder: "title" });
    s.addText("Ian Roybal\ngithub.com/ir272", { placeholder: "body" });
    s.addNotes("Add the live site link, and an email or X handle if you want one shown.");
  });

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
