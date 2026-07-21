/* =============================================================================
 * devlife.js — "DEV LIFE": an organic, event-driven data-scientist life sim.
 * -----------------------------------------------------------------------------
 * You graduate at 22 and live a whole career. Time flows naturally: the clock
 * fast-forwards to the next thing that needs you — a project decision, a bug, a
 * timed invitation, a life beat — while quiet stretches pass in a single "let a
 * few months pass". Work is PROJECTS that span weeks/months and grow BUGS;
 * EVENTS carry fixed time windows so you're always trading time against
 * something. Three pillars: 📈 career, 💰 wealth, ❤️ relationships.
 *
 * Win: RETIREMENT (choose it once eligible, or auto at 65) — graded on the three
 * pillars into a flavoured send-off. Fail early via 🔥 burnout (energy→0),
 * 💸 bankruptcy (too long underwater), or 🕳️ isolation (morale→0). Plus a couple
 * of rare comedic specials off risky choices (sentient-AI, investor fraud).
 *
 * Data-only: built on the generic engine (games/text-game.js) using its
 * function-valued `choices`/`goto` and instant HUD chunk. The engine is untouched.
 * ========================================================================== */
(function () {
  "use strict";
  if (!window.TextGame) return;

  /* ---- career ladder ------------------------------------------------------- */
  var LEVELS = [
    null,
    { name: "Junior DS 🐣", sal: 30 },
    { name: "Data Scientist", sal: 48 },
    { name: "Senior DS", sal: 78 },
    { name: "Staff DS", sal: 120 },
    { name: "Principal DS", sal: 175 },
    { name: "Director of DS", sal: 250 },
    { name: "VP of Data Science 👑", sal: 360 }
  ];
  var RICH = 1500;              // net worth that counts as "made it" (stealth wealth / retire-early)
  var UNICORN_VAL = 1000000;    // $1B company valuation — the classic "unicorn" bar; IPO opens here
  var BILLIONAIRE_NW = 1000000; // $1B PERSONAL net worth — only reachable by exiting a multi-billion-dollar company
  var GREED_CAP = 10000000;     // $10B: push the company past this instead of cashing out and you're "removed" for being too greedy

  /* ---- employers: workload/growth varies by the KIND of company you're at ----
   * startup → burns energy, grows you fast · unicorn (Google-ish) → medium, swings
   * with team luck · blue-chip (bank) → easy to coast but you stagnate (no work
   * skill/rep). Personal "upskill" still grows skill anywhere. */
  var COMPANY_NAMES = ["a hot startup 🚀", "Google 🔎", "a unicorn 🦄", "a big bank 🏦", "a scale-up 📊", "a FAANG 🧠"];
  function coType(name) {
    if (/startup|scale-up/.test(name)) return "startup";
    if (/bank/.test(name)) return "bluechip";
    return "unicorn";
  }
  function makeCompany(name) {
    var t = coType(name);
    return { name: name, type: t, team: t === "unicorn" ? (0.8 + rnd() * 0.4) : 1 };
  }
  function coMods(s) {
    var c = s.company, t = c ? c.type : "unicorn", team = (c && c.team) ? c.team : 1;
    if (t === "startup") return { energyMult: 1.45, skillGain: 2, repMult: 1.2, drift: -0.5 };
    if (t === "bluechip") return { energyMult: 0.6, skillGain: 0, repMult: 0, drift: 0.5 };
    return { energyMult: 1.3 - 0.3 * team, skillGain: 1, repMult: team, drift: team - 1 };  // unicorn: team luck
  }
  function coTag(s) {
    if (!s.company) return "";
    return s.company.type === "startup" ? "🚀" : s.company.type === "bluechip" ? "🏦" : "🦄";
  }

  /* ---- helpers ------------------------------------------------------------- */
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function rnd() { return Math.random(); }
  function chance(p) { return Math.random() < p; }
  function pickOne(a) { return a[Math.floor(rnd() * a.length)]; }
  function money$(k) { var a = Math.abs(k); return a >= 1000000 ? "$" + (k / 1000000).toFixed(2) + "b" : a >= 1000 ? "$" + (k / 1000).toFixed(1) + "m" : "$" + Math.round(k) + "k"; }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var START_YEAR = 2016;
  function age(s) { return 22 + Math.floor(s.day / 365); }

  // ---- experience tiers -----------------------------------------------------
  // Years since graduating. Job offers are gated by YoE: no poaching early on,
  // and the level you can be offered is tiered. You can get LUCKY (a stretch
  // offer one tier up) — but taking it leaves you over-levelled / under-prepared.
  function careerYears(s) { return Math.floor(s.day / 365); }
  // hard experience minimums: Data Scientist 1yr, Senior 3, Staff/Lead 7,
  // Principal 10. Beyond Principal is exec-only (a rare event) — harder still.
  function minYearsFor(lvl) { return lvl >= 5 ? 10 : lvl === 4 ? 7 : lvl === 3 ? 3 : lvl === 2 ? 1 : 0; }
  function expLevel(y) { return y >= 10 ? 5 : y >= 7 ? 4 : y >= 3 ? 3 : y >= 1 ? 2 : 1; }   // level your experience supports
  function offerTierCap(y) { return expLevel(y); }                                          // best level anyone will offer you
  // "under-prepared": only after you take a LUCKY STRETCH offer (a role above your
  // experience). It's a temporary window (~3 yrs) of being in over your head —
  // NOT a penalty on earned promotions/exec seats.
  function overLeveled(s) { return s.employed && !s.founder && s.stretchUntil && careerYears(s) < s.stretchUntil; }
  function dateLabel(s) {
    var y = START_YEAR + Math.floor(s.day / 365);
    var m = Math.min(11, Math.floor((s.day % 365) / 30.42));
    return MONTHS[m] + " " + y;
  }

  // capped 0–100 stats; money/invest/equity are uncapped.
  // A strong circle of friends is a SHOCK ABSORBER: negative morale (and, at half
  // strength, negative energy) is softened by support(s). Positive deltas are never
  // damped — friends cushion the falls, they don't cap the highs. A truly big hit
  // while you're well-supported may queue a "friends rallied round you" rebound
  // (drained next in accrue). The lonely (support === 0) take every blow at full force.
  function give(s, d) {
    if (d.morale != null && d.morale < 0) {
      if (d.morale <= -14 && support(s) >= 0.3 && chance(0.4 + support(s))) s.rallyPending = true;
      s.morale = clamp(s.morale + d.morale * (1 - support(s)));
    } else if (d.morale != null) s.morale = clamp(s.morale + d.morale);
    if (d.energy != null) s.energy = clamp(s.energy + (d.energy < 0 ? d.energy * (1 - 0.5 * support(s)) : d.energy));
    if (d.skill != null) s.skill = clamp(s.skill + d.skill);
    if (d.rep != null) s.rep = clamp(s.rep + d.rep);
    if (d.money != null) s.money += d.money;
    if (d.invest != null) s.invest += d.invest;
    if (d.equity != null) s.equity += d.equity;
  }
  function friends(s) { return s.friendsM + s.friendsW; }
  // social resilience 0..~0.65: a big, close circle absorbs life's blows, and a
  // live-in/married partner adds a little more. ZERO when you're truly alone — the
  // isolated take every hit at full force (and still drain toward burnout/fade).
  function support(s) {
    if (friends(s) === 0) return 0;
    var base = Math.min(0.6, friends(s) / (friends(s) + 14));   // 4→.22, 10→.42, 20→.59
    var partner = (s.love && s.love.stage !== "dating") ? 0.08 : 0;
    return Math.min(0.65, base + partner);
  }
  // a legible read-out of your safety net for the HUD.
  function supportTag(s) { var v = support(s); return v >= 0.45 ? "🛡️strong" : v >= 0.25 ? "🛡️ok" : "⚠️thin"; }
  // years spent in the current relationship (0 if none / start day unknown)
  function relYears(s) { return (s.love && s.love.since != null) ? (s.day - s.love.since) / 365 : 0; }
  // marriage odds: driven by TIME together and the relationship STRENGTH (close).
  function proposeSuccessP(s) {
    if (!s.love) return 0;
    return Math.max(0.15, Math.min(0.95, 0.2 + (relYears(s) - 1) * 0.14 + (s.love.close - 50) / 110));
  }
  function homeEquity(s) { return s.house ? Math.max(0, Math.round(s.house.value - s.house.debt)) : 0; }
  // mortality: from 50 on, each year carries a rising chance of death — you might
  // not make it to retirement, no matter how well things are going.
  function mortalityP(s) { var a = age(s); return a >= 50 ? (a - 50) * 0.006 + 0.003 : 0; }
  function addFriend(s, who) {   // who: "m" | "w" | undefined (random)
    if (who === undefined) who = chance(0.5) ? "m" : "w";
    if (who === "m") s.friendsM++; else s.friendsW++;
  }
  function loseFriend(s) { if (chance(0.5) && s.friendsM > 0) s.friendsM--; else if (s.friendsW > 0) s.friendsW--; else if (s.friendsM > 0) s.friendsM--; }

  function log(s, cls, msg) { (s.log = s.log || []).push([cls, msg]); }
  var GOOD = "tok-celebrate", WARN = "tok-num", NOTE = "tok-out", INFO = "tok-comment", STR = "tok-str";

  // Pending log lines (reactions + event outcomes) drawn at the top of the next
  // scene — hub OR event — so you get a response to EVERY action.
  function drainLog(s) {
    var out = [];
    if (s.log && s.log.length) { s.log.forEach(function (m) { out.push([m[0], m[1] + "\n"]); }); out.push([null, "\n"]); s.log = []; }
    return out;
  }
  // A flavour reaction to a plain action (so nothing ever happens silently).
  // {proj}/{name}/{city} are filled in when relevant.
  function react(s, arr, sub) {
    var t = pickOne(arr);
    if (sub) for (var k in sub) if (sub[k] != null) t = t.split("{" + k + "}").join(sub[k]);
    log(s, INFO, t);
  }
  var RX = {
    rest:   ["🛋️ You switch off for a while — the fog lifts.", "😴 Proper sleep, no alarms. You feel human again.", "🌿 A slow stretch away from the screen. Recharged."],
    focus:  ["🎯 Heads-down on {proj}. Real progress.", "⌨️ Deep work — {proj} takes shape.", "🧠 A focused sprint on {proj}."],
    upskill:["📚 A course clicks — you're sharper.", "🧪 A weekend side-project teaches you plenty.", "🎓 You go deep on something new and come out better."],
    holiday:["🌴 A proper holiday — sun, no Slack. Bliss.", "✈️ Two weeks away and you come back new.", "🏖️ You actually unplug. Rare. Restorative."],
    love:   ["❤️ Quality time with {name} — you both needed it.", "🍷 A lovely evening in with {name}.", "💑 You and {name} just click lately."],
    hunt:   ["🔎 Applications out, LeetCode grinded. Tiring.", "💼 A week of back-to-back interviews.", "📞 Recruiter calls and take-home tests."],
    coast:  ["⏭️ The months roll quietly by.", "🗓️ Life ticks along without much drama.", "☕ An uneventful, ordinary stretch."],
    build:  ["🚀 You ship features at founder pace.", "🌙 Nights and weekends, building.", "⚙️ The product inches forward."],
    date:   ["😐 A few dead-end dates. Ah well.", "📱 Lots of swiping, not much spark.", "🥴 One truly awful date. Good story, at least."]
  };

  /* ---- people / project pools --------------------------------------------- */
  var MNAMES = ["Marcus", "Raj", "Tom", "Chen", "Diego", "Omar", "Liam", "Noah", "Ivan", "Kwame", "Sam", "Theo"];
  var WNAMES = ["Priya", "Sara", "Mia", "Lena", "Aisha", "Nina", "Zoe", "Emma", "Yuki", "Fatima", "Cara", "Ada"];
  var TRAITS = ["a backend dev", "a designer", "a PM", "a founder", "a nurse", "a teacher", "a musician",
    "a lawyer", "a chef", "a barista", "a data engineer", "a recruiter", "an artist", "a doctor"];
  var CITIES = ["Berlin", "Austin", "Lisbon", "Singapore", "Toronto", "Dublin", "NYC"];
  function person() { var w = chance(0.5); return { name: pickOne(w ? WNAMES : MNAMES), w: w, trait: pickOne(TRAITS) }; }

  /* ---- friend outings -----------------------------------------------------
   * "See friends / go out" isn't flavour any more — a night out draws from a big
   * pool of outcomes that actually SWING your stats (heavier mechanics), most
   * upside but a real minority of bad nights. Light, transformative homages to
   * Friends / How I Met Your Mother run through it. `d` is a give() delta; `friend`
   * ±1 grows/loses your circle; `love:true` can spark a relationship (single only);
   * `when(s)` gates the context-specific ones. ~1 in 7 outings escalates into a
   * SOCIAL_BRANCH mini-decision instead. {name} is filled with your partner (or a
   * new spark) at runtime. */
  var SOCIAL = [
    // legendary / great nights (fun, often costly)
    { t: "🍻 A legen— wait for it —dary night at the pub. You'll be telling this one for years.", d: { morale: 16, energy: -9, money: -6 } },
    { t: "🎉 The whole crew ended up back at yours till 3am — and nothing good happens after 2am, except this.", d: { morale: 14, energy: -8, money: -6 } },
    { t: "🕺 A dance floor, terrible decisions, brilliant memories.", d: { morale: 13, energy: -7, money: -8 } },
    { t: "🍸 Someone yelled 'suit up!' and it became the best night out in months.", d: { morale: 15, energy: -8, money: -7 }, friend: 1 },
    { t: "🎤 Karaoke went off. Your 'Smelly Cat' genuinely brought the house down.", d: { morale: 12, energy: -6, money: -5 } },
    { t: "🌃 Rooftop drinks, city lights, your favourite people. Perfect.", d: { morale: 13, energy: -4, money: -9 } },
    { t: "🍕 3am pizza with the gang, laughing till it hurt.", d: { morale: 11, energy: -3, money: -4 } },
    { t: "🎳 Bowling night turned into a full tournament. You lost. Gloriously.", d: { morale: 10, energy: -4, money: -6 } },
    { t: "🏝️ A spontaneous weekend away with mates. Worth every penny.", d: { morale: 15, energy: 4, money: -10 } },
    { t: "🎸 You crashed a friend's gig and got pulled on stage. Unforgettable.", d: { morale: 12, energy: -5, money: -3 }, friend: 1 },
    { t: "🎉 An impromptu birthday do that became the night of the year.", d: { morale: 13, energy: -6, money: -9 }, friend: 1 },
    { t: "🔥 A backyard fire, a guitar, and people you'd take a bullet for.", d: { morale: 12, energy: 3, money: -3 } },
    { t: "🎿 A group trip you almost skipped turned out unmissable.", d: { morale: 14, energy: 2, money: -9 }, friend: 1 },
    // good, steady hangs
    { t: "☕ Hours at the coffee house, putting the world to rights.", d: { morale: 8, energy: 2, money: -3 } },
    { t: "🍜 A long, laughy dinner where nobody wanted to leave.", d: { morale: 9, energy: 1, money: -6 } },
    { t: "🧑‍🤝‍🧑 Just the usual crew in the usual booth. Exactly what you needed.", d: { morale: 8, energy: 3, money: -4 } },
    { t: "🎬 Film night on the sofa, everyone talking over the movie.", d: { morale: 7, energy: 4, money: -2 } },
    { t: "🥾 A big Sunday walk with friends and a pub at the end of it.", d: { morale: 9, energy: 2, money: -5 } },
    { t: "🍳 Lazy brunch that ran until dinner. Bliss.", d: { morale: 8, energy: 3, money: -7 } },
    { t: "🎮 Games night. Someone flipped the board. Order restored, eventually.", d: { morale: 8, energy: 1, money: -2 } },
    { t: "🌿 A calm evening among people who get you. The fog lifts.", d: { morale: 9, energy: 5 } },
    { t: "📻 Vinyl, cheap wine, old stories. A good, gentle night.", d: { morale: 8, energy: 2, money: -3 } },
    { t: "🍺 One quiet pint that fixed a whole rough week.", d: { morale: 10, energy: 4, money: -3 } },
    { t: "🌮 Taco night at a friend's — you laughed so hard you forgot every deadline.", d: { morale: 10, energy: 1, money: -4 } },
    { t: "🧉 A slow, sunny afternoon in a beer garden. No phones, just people.", d: { morale: 10, energy: 5, money: -5 } },
    // set-piece homages
    { t: "🛋️ You claimed the good couch at the coffee house before anyone else. Small victories.", d: { morale: 7, energy: 3, money: -3 } },
    { t: "🦞 A friend insists you two are 'each other's lobsters'. You don't hate it.", d: { morale: 9, energy: 1 } },
    { t: "🐐 A friend's story about a goat at a birthday goes on for two hours. Somehow, worth it.", d: { morale: 8, energy: -2, money: -4 } },
    { t: "☂️ You shared a yellow umbrella through the rain — felt oddly like the start of something.", d: { morale: 10, energy: 1 } },
    { t: "📊 A friend brought actual charts to explain their weekend. You're a little in awe.", d: { morale: 8, energy: 1 } },
    { t: "🍍 The night's a blur and there's a pineapple on your counter. Nobody knows why. Great night, though.", d: { morale: 12, energy: -9, money: -7 } },
    { t: "🍗 Someone got a turkey stuck on their head at dinner. You cried laughing.", d: { morale: 11, energy: -2, money: -5 } },
    { t: "🃏 A friend runs their 'playbook' of chat-up lines — all disasters. You're crying.", d: { morale: 9, energy: -2, money: -4 } },
    { t: "🚕 Your usual driver got you all home safe after another big one.", d: { morale: 8, energy: 2, money: -6 } },
    { t: "🎽 A friend swears the new plan is always better than the old plan. Tonight, they were right.", d: { morale: 10, energy: -3, money: -5 }, friend: 1 },
    { t: "🤷 A whole argument about whether something counts as a 'moo point'. You've never laughed harder.", d: { morale: 8 } },
    // new friend made
    { t: "🤝 A friend introduced you to someone great — 'have you met…?' — and you clicked instantly.", d: { morale: 9, energy: -2, money: -4 }, friend: 1 },
    { t: "🍻 You bonded with a stranger over a shared hatred of stand-ups. New friend unlocked.", d: { morale: 8, money: -3 }, friend: 1 },
    { t: "🎲 A board-game café, and you ended up adopting a whole new friend group.", d: { morale: 10, energy: -3, money: -5 }, friend: 1 },
    { t: "🧗 A friend dragged you to their climbing gym. Terrifying. You made a mate.", d: { morale: 7, energy: -6 }, friend: 1 },
    { t: "🐶 A dog-park chat turned into a proper friendship. The dog approved.", d: { morale: 8, energy: 2 }, friend: 1 },
    { t: "🍷 A dinner party sat you next to someone brilliant. You're already planning the next one.", d: { morale: 9, money: -5 }, friend: 1 },
    { t: "⚽ Five-a-side with a new crew. You're rubbish, but you're in.", d: { morale: 8, energy: -5 }, friend: 1 },
    { t: "🎨 A pottery class you got peer-pressured into. Made a bowl, made a friend.", d: { morale: 7, energy: -3, money: -6 }, friend: 1 },
    // showing up for people (the heart of it)
    { t: "🛠️ You spent the day helping a mate fix their flat. Knackering, but you're closer for it.", d: { morale: 9, energy: -7 }, friend: 1 },
    { t: "📦 You helped a friend move house. Your back hates you; your heart doesn't.", d: { morale: 8, energy: -9 } },
    { t: "💬 A friend needed to talk till 2am. You showed up. That's what it's for.", d: { morale: 6, energy: -5 } },
    { t: "🚗 The 5am airport run for a friend. No questions asked. That's the deal.", d: { morale: 7, energy: -6 } },
    { t: "🍲 You cooked for a friend having a hard week. They needed it — so did you.", d: { morale: 8, energy: -2, money: -4 } },
    { t: "🧳 You talked a friend down off a bad decision. They'll thank you eventually.", d: { morale: 6, energy: -3 } },
    // fun but costly / hangover
    { t: "🥴 Rough one. Big fun, bigger hangover. Worth it? Ask you tomorrow.", d: { morale: 9, energy: -11, money: -9 } },
    { t: "💸 You insisted on getting the round in. All the rounds, actually.", d: { morale: 8, energy: -5, money: -9 } },
    { t: "🎰 A casino detour on the way home. You know how this ends.", d: { morale: 4, energy: -4, money: -8 } },
    { t: "🍔 A blur of a night and a receipt you're afraid to read.", d: { morale: 7, energy: -8, money: -7 } },
    { t: "🎡 Someone's 'great idea' of a funfair at midnight. Chaos. Joy. Nausea.", d: { morale: 8, energy: -7, money: -8 } },
    { t: "🕶️ You said 'just one'. It was not just one.", d: { morale: 7, energy: -9, money: -7 } },
    // learning / a quiet leg-up from friends
    { t: "🧠 A friend in the field talked shop all night — you picked up a genuinely useful trick.", d: { morale: 6, skill: 3, energy: -2, money: -4 } },
    { t: "💼 A mate put in a good word for you somewhere. Nice to be thought of.", d: { morale: 7, rep: 3, money: -3 } },
    { t: "📚 Book club — if 'book club' means wine and gossip. You even discussed the book. Briefly.", d: { morale: 7, money: -4 } },
    { t: "🎧 A friend made you a playlist and a case for their favourite band. Converted.", d: { morale: 8, energy: 1 } },
    { t: "🍳 A friend taught you their signature dish. You'll ruin it at home, but still.", d: { morale: 7, energy: -2, money: -3 } },
    // quiet / neutral
    { t: "😌 A quiet catch-up. Nothing dramatic, and that's fine.", d: { morale: 4, energy: 2 } },
    { t: "📱 Half the group flaked, but the ones who came were the right ones.", d: { morale: 5, energy: 1, money: -3 } },
    { t: "🚪 An early night — you showed your face and slipped off. No harm done.", d: { morale: 3, energy: 3 } },
    { t: "☕ A short coffee that was mostly logistics for the next thing.", d: { morale: 3, money: -2 } },
    { t: "🧋 A wander round town with a mate, nowhere to be.", d: { morale: 5, energy: 1, money: -3 } },
    { t: "🌦️ Plans got rained off; you sheltered in a pub and made the best of it.", d: { morale: 5, energy: 1, money: -4 } },
    // bad nights
    { t: "😬 A friend picked a fight over nothing and soured the whole evening.", d: { morale: -7, energy: -3, money: -4 } },
    { t: "🧾 You got stuck with the whole bill. Again. It stings.", d: { morale: -5, money: -8 } },
    { t: "🙄 An hour of a friend humble-bragging. You left flat.", d: { morale: -6, energy: -2, money: -3 } },
    { t: "😷 You caught something doing the rounds. The night — and the next week — are a write-off.", d: { morale: -5, energy: -10, money: -3 } },
    { t: "📵 Everyone was on their phones. You might as well have stayed in.", d: { morale: -6, energy: -2, money: -4 } },
    { t: "🚕 A miserable, expensive scramble home in the rain.", d: { morale: -4, energy: -4, money: -8 } },
    { t: "🍸 You bumped into someone you'd rather not have. Awkward all round.", d: { morale: -6, energy: -2 } },
    { t: "😤 A political row erupted at dinner. No winners. Cold pasta.", d: { morale: -7, money: -5 } },
    // cringe (comedic small hits)
    { t: "😳 You told a long story with a big finish. Nobody laughed. Nobody will forget.", d: { morale: -5, energy: -2 } },
    { t: "👖 You wore the wrong thing, got too warm, and could not get back out of it. A whole saga.", d: { morale: -4 } },
    { t: "🤦 You called a friend's new partner by completely the wrong name. Oof.", d: { morale: -6 } },
    { t: "🍽️ You reached for a chip off a friend's plate. Turns out they REALLY don't share food.", d: { morale: -3, energy: 1 } },
    // fall-outs (lose a friend)
    { t: "💥 An old tension finally blew up. You both said too much. One friend, gone.", d: { morale: -9, energy: -3 }, friend: -1 },
    { t: "🧊 A friend's been distant for months; tonight it quietly became official.", d: { morale: -7 }, friend: -1 },
    { t: "🗣️ You found out a friend had been talking behind your back. That's that.", d: { morale: -8 }, friend: -1 },
    // love sparks (single only)
    { t: "💕 A friend introduced you to {name} — and you couldn't stop smiling. You're seeing each other now.", d: { morale: 10, energy: -2, money: -4 }, love: true, when: function (s) { return !s.love; } },
    { t: "💘 You and {name} kept finding each other at the bar all night. Numbers exchanged. You're dating.", d: { morale: 9, money: -4 }, love: true, when: function (s) { return !s.love; } },
    { t: "🌧️ You shared an umbrella with {name} on the walk home. Something clicked. You're an item.", d: { morale: 11 }, love: true, when: function (s) { return !s.love; } },
    // partner-present variants
    { t: "💑 You brought {name} along and your friends adore them. Best of both worlds.", d: { morale: 11, energy: -2, money: -6 }, when: function (s) { return !!s.love; } },
    { t: "🍷 A double date with friends and {name}. Easy, warm, lovely.", d: { morale: 9, money: -7 }, when: function (s) { return !!s.love; } },
    { t: "😅 {name} and a friend clashed a bit tonight — nothing fatal, but you played referee.", d: { morale: -3, energy: -2 }, when: function (s) { return !!s.love; } },
    // founder-flavour
    { t: "🚀 The founder friends came out and swapped war stories. You feel less alone in it.", d: { morale: 9, energy: -2, money: -5 }, when: function (s) { return !!s.founder; } },
    { t: "🧑‍💻 A founder mate talked you off a ledge about the company. Cheaper than therapy.", d: { morale: 8 }, when: function (s) { return !!s.founder; } },
    // later-life flavour
    { t: "👶 Half the group brought kids; it was carnage, and somehow the best kind.", d: { morale: 8, energy: -4, money: -4 }, when: function (s) { return age(s) >= 40; } },
    { t: "🍷 A grown-up dinner with the old crowd. You've all changed; the bond hasn't.", d: { morale: 9, money: -6 }, when: function (s) { return age(s) >= 40; } }
  ];

  // ~1 in 7 outings turns into a proper story you have to make a call on.
  var SOCIAL_BRANCH = [
    { f: function (s) {
        return ev("🖐️ The Slap Bet",
          [line(STR, "A friend is dead certain about something daft and slaps down a bet — loser takes a slap. The whole pub is watching.\n")],
          [{ label: "Take the slap bet.", match: ["take", "bet", "yes", "1"],
              effect: act(0, "social", function (st) { if (chance(0.5)) { give(st, { morale: 12, energy: -2 }); log(st, GOOD, "🖐️ You were RIGHT — the slap echoes into legend. Best night in ages."); } else { give(st, { morale: -6, energy: -2 }); log(st, WARN, "🖐️ You were wrong. That one stung — cheek AND pride."); } }), goto: nextScene },
           { label: "Wave it off, buy a round instead.", match: ["decline", "no", "round", "2"],
              effect: act(0, "social", function (st) { give(st, { morale: 4, money: -6 }); log(st, NOTE, "🍻 No slaps, just a round. A quieter kind of win."); }), goto: nextScene }]);
      } },
    { f: function (s) {
        var pot = 8 + Math.floor(rnd() * 10);
        return ev("🎲 There's a pool running",
          [line(null, "The group's got a bet going and everyone's chucked in ~$" + pot + "k. Winner takes the pot.\n")],
          [{ label: "Get in on it.", match: ["in", "bet", "yes", "1"],
              effect: act(0, "social", function (st) { st.money -= pot; if (chance(0.45)) { var win = pot * 3; st.money += win; give(st, { morale: 12 }); log(st, GOOD, "🏆 You cleaned up — $" + win + "k and eternal bragging rights."); } else { give(st, { morale: -4 }); log(st, WARN, "🙃 Lost your $" + pot + "k stake. Someone else is buying, at least."); } }), goto: nextScene },
           { label: "Keep your money in your pocket.", match: ["out", "no", "2"],
              effect: act(0, "social", function (st) { give(st, { morale: 2 }); log(st, NOTE, "😌 You sat it out and watched the carnage. Wise."); }), goto: nextScene }]);
      } },
    { f: function (s) {
        return ev("🌃 'Tonight is going to be legen—'",
          [line(STR, "A friend stands on a chair and promises tonight will be legendary. It's a school night. There's an early meeting. The crew is looking at you.\n")],
          [{ label: "Wait for it… commit to the night.", match: ["commit", "wait", "yes", "in", "1"],
              effect: act(1, "social", function (st) { if (chance(0.7)) { give(st, { morale: 18, energy: -13, money: -8 }); log(st, GOOD, "🌟 …DARY. An all-timer — you'll dine out on this for a decade."); } else { give(st, { morale: 6, energy: -14, money: -7 }); log(st, WARN, "🥴 Legendary in ambition, brutal in execution. The morning was a war crime."); } }), goto: nextScene },
           { label: "Call it early and get your sleep.", match: ["early", "home", "no", "2"],
              effect: act(0, "social", function (st) { give(st, { morale: 4, energy: 6, money: -3 }); log(st, NOTE, "😴 One drink, then home. The meeting will be glad."); }), goto: nextScene }]);
      } },
    { f: function (s) {
        return ev("🛋️ 'PIVOT!'",
          [line(null, "A friend is wrestling a sofa up a narrow stairwell and needs a second pair of hands. It's 33 degrees, and there's a lot of shouting about angles.\n")],
          [{ label: "Grab the other end.", match: ["help", "grab", "yes", "1"],
              effect: act(0, "social", function (st) { addFriend(st); give(st, { morale: 8, energy: -8 }); log(st, GOOD, "🛋️ 'PIVOT! PI-VOT!' You got it up, somehow. A friend for life."); }), goto: nextScene },
           { label: "Suddenly remember you have plans.", match: ["beg", "no", "leave", "2"],
              effect: act(0, "social", function (st) { give(st, { morale: -3 }); log(st, INFO, "🚪 You slipped away. The sofa, and the guilt, remain."); }), goto: nextScene }]);
      } },
    { when: function (s) { return !s.love; }, f: function (s) {
        var p = person();
        return ev("😏 'Have you met " + p.name + "?'",
          [line(STR, "Classic move — a friend physically deposits you next to " + p.name + " (" + p.trait + ") and vanishes. The ball's in your court.\n")],
          [{ label: "Say hi and see where it goes.", match: ["hi", "yes", "go", "1"],
              effect: act(1, "social", function (st) { if (chance(0.55)) { st.love = { name: p.name, w: p.w, close: 44, stage: "dating", since: st.day }; give(st, { morale: 12 }); log(st, GOOD, "💕 You and " + p.name + " hit it off — you're seeing each other now."); } else { addFriend(st, p.w ? "w" : "m"); give(st, { morale: 4 }); log(st, NOTE, "🙂 No spark, but " + p.name + " turned out to be a great new friend."); } }), goto: nextScene },
           { label: "Not tonight — happy with the crew.", match: ["no", "later", "2"],
              effect: act(0, "social", function (st) { give(st, { morale: 3 }); }), goto: nextScene }]);
      } },
    { f: function (s) {
        return ev("❓ A ferocious pub quiz",
          [line(null, "Your team is neck-and-neck into the final round, and a friend wants to gamble all your points on a sudden-death question.\n")],
          [{ label: "Go all in on the wager.", match: ["allin", "gamble", "yes", "1"],
              effect: act(0, "social", function (st) { if (chance(0.5)) { give(st, { morale: 12, skill: 1 }); log(st, GOOD, "🏆 Nailed it. The team erupts. Bar tab's on the house."); } else { give(st, { morale: -6 }); log(st, WARN, "😵 So close. The other team will not let you forget it."); } }), goto: nextScene },
           { label: "Play it safe and hold your lead.", match: ["safe", "hold", "no", "2"],
              effect: act(0, "social", function (st) { if (chance(0.55)) { give(st, { morale: 7 }); log(st, GOOD, "🥈 You held on for the win. Unglamorous, effective."); } else { give(st, { morale: 1 }); log(st, NOTE, "🤷 Pipped at the post, but a good night regardless."); } }), goto: nextScene }]);
      } },
    { f: function (s) {
        return ev("🎤 Open-mic night",
          [line(null, "A friend has signed you up for the open mic 'as a bit'. The list has your name on it. People are clapping expectantly.\n")],
          [{ label: "Get up there and go for it.", match: ["sing", "go", "yes", "1"],
              effect: act(0, "social", function (st) { if (chance(0.5)) { addFriend(st); give(st, { morale: 14, energy: -3 }); log(st, GOOD, "🌟 You brought the house down — strangers bought you drinks. A star is (briefly) born."); } else { give(st, { morale: -5, energy: -2 }); log(st, WARN, "😬 Rough. 'Smelly Cat' has never sounded worse. The crew loved it, mercifully."); } }), goto: nextScene },
           { label: "Hide in the bathroom until it passes.", match: ["hide", "no", "2"],
              effect: act(0, "social", function (st) { give(st, { morale: 2 }); log(st, INFO, "🚻 You dodged it. Your dignity, and your dreams, intact."); }), goto: nextScene }]);
      } },
    { f: function (s) {
        return ev("🦃 Friendsgiving",
          [line(STR, "The group wants a big Friendsgiving, and someone needs to host. All eyes turn, slowly, to you.\n")],
          [{ label: "Host the whole thing.", match: ["host", "yes", "1"],
              effect: act(2, "social", function (st) { addFriend(st); give(st, { morale: 15, energy: -8, money: -7 }); log(st, GOOD, "🦃 Chaos, a near-disaster with the turkey, and the best night of the year. You're the glue of this group."); }), goto: nextScene },
           { label: "Happily just show up with wine.", match: ["show", "attend", "no", "2"],
              effect: act(1, "social", function (st) { give(st, { morale: 9, money: -5 }); log(st, NOTE, "🍷 You rocked up with two bottles and zero responsibility. Perfect."); }), goto: nextScene }]);
      } }
  ];

  // Resolve one outing. Returns a branch event to inject (rendered after the clock
  // advances, so it never stomps an event rolled by advance), or null for a one-shot.
  function socialOuting(s) {
    if (chance(0.14)) { var brs = SOCIAL_BRANCH.filter(function (b) { return !b.when || b.when(s); }); if (brs.length) return pickOne(brs).f(s); }
    var o = pickOne(SOCIAL.filter(function (x) { return !x.when || x.when(s); }));
    var name = s.love ? s.love.name : null;
    if (o.love && !s.love) { var pp = person(); s.love = { name: pp.name, w: pp.w, close: 44, stage: "dating", since: s.day }; name = pp.name; }
    if (o.d) give(s, o.d);
    if (o.friend) { if (o.friend > 0) addFriend(s); else loseFriend(s); }
    var t = o.t.split("{name}").join(name || "them");
    var neg = !o.love && o.d && ((o.d.morale || 0) < 0 || (o.d.money || 0) <= -8);
    log(s, o.love ? GOOD : (neg ? WARN : GOOD), t);
    return null;
  }

  var PROJECTS = [
    { name: "a fraud-detection model", tech: "XGBoost" },
    { name: "a recommender system", tech: "a two-tower net" },
    { name: "an LLM support agent", tech: "RAG" },
    { name: "a churn forecast", tech: "survival analysis" },
    { name: "a data-platform migration", tech: "Spark" },
    { name: "a pricing experiment", tech: "causal inference" },
    { name: "a demand forecast", tech: "gradient boosting" },
    { name: "a real-time anomaly detector", tech: "streaming" }
  ];

  /* ---- projects ------------------------------------------------------------ */
  function startProject(s) {
    var p = pickOne(PROJECTS);
    var weeks = 10 + Math.floor(rnd() * 14);     // 10–23 weeks of effort (projects are a slog)
    s.project = {
      name: p.name, tech: p.tech, weeksNeeded: weeks, weeksDone: 0,
      bugs: 0, quality: 82, deadlineDay: s.day + (weeks + 4 + Math.floor(rnd() * 8)) * 7
    };
    log(s, NOTE, "🛠️ New project: " + p.name + " (" + p.tech + "), ~" + weeks + " weeks.");
  }
  function focusProject(s, weeks) {
    var m = coMods(s);
    var eff = weeks * (0.5 + s.skill / 130);      // skill speeds delivery (slower base than before)
    s.project.weeksDone += eff;
    give(s, { energy: -(6 + weeks) * m.energyMult, skill: m.skillGain });
    if (chance(0.14)) { addFriend(s); s.workFriends = (s.workFriends || 0) + 1; log(s, GOOD, "🤝 You clicked with a colleague — a new work friend."); }
    if ((s.workFriends || 0) > 0 && friends(s) > 0) give(s, { morale: 3 });   // work friends = social time (but no recharge)
  }
  function shipProject(s) {
    var p = s.project; s.project = null;
    var m = coMods(s);
    var onTime = s.day <= p.deadlineDay;
    var q = p.quality - p.bugs * 9;
    function repUp(n) { return Math.round(n * m.repMult); }   // positive rep gated by employer (0 at a blue-chip)
    if (q >= 78 && onTime && chance(0.5)) {                    // 🌟 breakout
      var big = Math.round(s.salary * 0.15);
      give(s, { skill: 6, rep: repUp(14), morale: 14, money: big });
      log(s, GOOD, "🌟 Breakout launch! " + p.name + " is a hit — $" + big + "k bonus" + (m.repMult ? ", reputation soars" : "") + ".");
      maybePromote(s);
    } else if (q >= 60 && onTime) {                            // 🚀 clean
      var bonus = Math.round(s.salary * 0.08);
      give(s, { skill: 5, rep: repUp(9), morale: 8, money: bonus });
      log(s, GOOD, "🚀 Shipped " + p.name + " clean and on time! $" + bonus + "k bonus.");
      maybePromote(s);
    } else if (q >= 60) {                                      // 🐢 late but works
      give(s, { rep: repUp(3), morale: 3 });
      log(s, NOTE, "🐢 Shipped " + p.name + " — late, but it works. Small win.");
    } else if (q >= 40) {                                      // 😕 underwhelming
      give(s, { rep: -6, morale: -6 });
      log(s, WARN, "😕 Shipped " + p.name + " rough — bugs in prod, a lukewarm reception.");
    } else {                                                   // 🧨 disaster
      give(s, { rep: -13, morale: -11, energy: -4 });
      log(s, WARN, "🧨 " + p.name + " flopped hard — rolled back after launch. Reputation took a real hit.");
    }
  }
  function maybePromote(s) {
    // Normal promotions cap at Principal (level 5 — the top IC rung). Director/VP
    // (6/7) are scarce EXEC seats reached only via the rare "exec_opening" event,
    // so most careers plateau as senior ICs (→ stealth wealth) and VP is rare.
    if (s.founder || !s.employed || s.level >= 5) return;
    if (expLevel(careerYears(s)) < s.level + 1) return;   // not enough years on the clock for the next rung yet
    var needSkill = 12 + s.level * 9, needRep = 10 + s.level * 8;
    if (s.skill >= needSkill && s.rep >= needRep && chance(Math.max(0.35, 0.6 - s.level * 0.05))) {
      s.level++; s.salary = LEVELS[s.level].sal + Math.round(rnd() * 20);
      give(s, { morale: 12, rep: -3 });
      log(s, GOOD, "📈 Promoted to " + LEVELS[s.level].name + "! Salary now $" + s.salary + "k.");
    }
  }

  /* ---- the startup you might found ---------------------------------------- */
  // Founding replaces the bare `equity` number with a company (`s.co`): you build
  // a product, hire (for salary or equity), earn revenue, raise gated rounds and —
  // 5–10 years in — IPO or take an acquisition. `s.equity` is your derived paper
  // stake (valuation × your ownership). Company cash/valuation are the COMPANY's
  // wealth; `s.money`/`s.invest` are YOURS.
  var IDEAS = [
    { name: "an ML fraud-detection API", tech: "gradient boosting" },
    { name: "a dev-tools copilot", tech: "LLMs" },
    { name: "a healthcare triage assistant", tech: "RAG" },
    { name: "a demand-forecasting platform", tech: "time-series" },
    { name: "a retail personalisation engine", tech: "recommenders" },
    { name: "a climate-risk analytics tool", tech: "geospatial ML" },
    { name: "an autonomous data-cleaning service", tech: "LLM agents" }
  ];
  var ROUND_NAMES = ["a seed", "a Series A", "a Series B", "a Series C", "a Series D"];
  function roundName(r) { return ROUND_NAMES[Math.min(r, ROUND_NAMES.length - 1)]; }
  function raiseReq(r) { return [10, 40, 90, 150, 200][Math.min(r, 4)]; }   // revenue needed for the next round
  function syncEquity(s) { s.equity = s.co ? Math.round(s.co.valuation * s.co.ownership) : 0; }
  function foundCompany(s, ideaName) {
    s.founder = true; s.employed = false; s.project = null; s.company = null;
    s.co = { name: ideaName || "your startup", foundedDay: s.day, stage: "build",
      product: 8, revenue: 0, cash: 80, employees: 0, equityStaff: 0,
      valuation: 500, ownership: 0.9, rounds: 0, lastRaiseDay: s.day };
    syncEquity(s);
    give(s, { morale: 16, energy: -6 });
    log(s, GOOD, "🦄 You founded " + s.co.name + "! You own 90% of a company worth ~" + money$(s.co.valuation) + ".");
  }
  function companyFold(s) {
    s.founder = false; s.employed = false; s.co = null; s.equity = 0;
    give(s, { morale: -18 });
    log(s, WARN, "🪫 Out of runway — the company folded and your stake is worth nothing. Back to the job market.");
  }

  /* ---- the passing of time ------------------------------------------------- */
  function accrue(s, weeks) {
    // a beat after a hard knock, your people show up — the rebound only the
    // well-supported get (queued by give() when a big morale hit lands).
    if (s.rallyPending) { s.rallyPending = false; give(s, { morale: Math.round(6 + rnd() * 4), energy: 4 }); log(s, GOOD, "🤝 Your friends rallied round you — you're not carrying this alone."); }
    var yr = weeks / 52;
    var living = 13 + s.level * 3 + (s.love && s.love.stage !== "dating" ? 8 : 0) + (s.kids || 0) * 10;  // kids cost you
    var take = 0;
    if (s.employed && !s.founder) take = s.salary * 0.72;
    else if (s.founder && s.co) {
      var co = s.co;
      // you pay yourself a living wage from the company (personal money ~flat) as long
      // as there's cash; the company's cash is the real risk, not your rent.
      var salary = co.cash > 0 ? living : 0;
      var burn = salary + (co.employees - co.equityStaff) * 70 + co.equityStaff * 30 + 12;
      co.cash += (co.revenue - burn) * yr;
      co.valuation = Math.max(co.valuation, Math.round(co.revenue * 8 + co.product * 3));
      take = salary;                                                           // take == living → personal money flat while solvent
      syncEquity(s);
      if (co.cash < -8) companyFold(s);                                        // ran out of runway → company dies
    }
    s.money += (take - living) * (weeks / 52);
    // investments grow ~5%/yr, or ~17%/yr inside a post-recession recovery window
    var growth = (s.boostUntil && s.day < s.boostUntil) ? 1.17 : 1.05;
    s.invest = Math.round(s.invest * Math.pow(growth, weeks / 52));
    // your market value slowly rusts while you're out of work → offers shrink
    if (!s.employed && !s.founder) s.marketBump = Math.max(-0.3, (s.marketBump || 0) - 0.015 * (weeks / 8));
    // mortgage: interest accrues on the debt, scheduled payments chip principal;
    // if you can't cover them your cash goes underwater → bankruptcy (below).
    if (s.house && s.house.debt > 0) {
      var yr = weeks / 52;
      var interest = s.house.debt * s.house.rate * yr;
      var pay = s.house.pay * yr;
      s.money -= pay;
      s.house.debt = Math.max(0, s.house.debt - Math.max(0, pay - interest));
      if (s.house.debt <= 0) s.house.pay = 0;        // paid off — you own it outright
    }
    if (s.house) s.house.value = Math.round(s.house.value * Math.pow(1.03, weeks / 52));  // slow appreciation → equity
    give(s, { morale: -0.5 * (weeks / 4), energy: 0.4 * (weeks / 4) });  // life goes stale; you recover slowly at rest
    if (s.employed && !s.founder) give(s, { energy: coMods(s).drift * (weeks / 4) });  // startup grinds you; blue-chip is restful
    if (overLeveled(s)) give(s, { morale: -1.4 * (weeks / 4), energy: -0.6 * (weeks / 4) });  // in over your head: imposter stress
    if (friends(s) === 0) give(s, { energy: -2.5 * (weeks / 4), morale: -0.8 * (weeks / 4) });  // no support network → the battery drains FAST
    if (s.love) {
      s.love.close = clamp(s.love.close - 0.9 * (weeks / 4));
      if (s.love.close < 22 && chance(0.35)) {
        log(s, WARN, "💔 Things fizzled with " + s.love.name + ".");
        s.love = null; give(s, { morale: -12 });
      }
    }
    // liquidate investments to stay afloat before you ever go truly bankrupt
    if (s.money < 0 && s.invest > 0) { var cover = Math.min(s.invest, -s.money); s.invest -= cover; s.money += cover; }
    // a small overdraft is survivable; only a DEEP, sustained hole bankrupts you
    if (s.money < -20) s.debtWeeks = (s.debtWeeks || 0) + weeks; else s.debtWeeks = 0;
  }

  // advance `weeks`, stepping in chunks so an event can interrupt. tag hints
  // context ("focus" → bug risk, "hunt" → job offers).
  // Friendships age. When young they're easy to keep; at 30/40/50 life pulls
  // ~half your circle apart (one-time), and the survivors are friends for life
  // that drift only slowly. A turn spent being social (incl. working beside a
  // work friend) skips the drift.
  function ageFriendship(s, tag) {
    var a = age(s);
    [30, 40, 50].forEach(function (th) {
      if (a >= th && !(s.culls && s.culls[th])) {
        (s.culls = s.culls || {})[th] = 1;
        var before = friends(s), keep = Math.round(before * (0.45 + rnd() * 0.15));
        for (var i = before; i > keep; i--) loseFriend(s);
        if (before - friends(s) > 0) log(s, INFO, "🌍 Life pulls people in different directions — your circle narrows to your closest " + friends(s) + ".");
      }
    });
    var social = tag === "social" || (tag === "focus" && (s.workFriends || 0) > 0);
    if (!social) {
      var p = a < 30 ? 0.02 : a < 45 ? 0.05 : 0.025;
      if (chance(p)) loseFriend(s);
    }
  }

  function advance(s, weeks, tag) {
    // Each action is a "turn". Go 10 turns with NO friends and you quietly fade
    // out of your own life — you need people to survive.
    if (friends(s) === 0) {
      s.noFriendsTurns = (s.noFriendsTurns || 0) + 1;
      log(s, WARN, "🕳️ You've no one left to lean on — energy and spirit drain fast, and nobody makes it alone for long. Go and see people.");
      if (s.noFriendsTurns >= 10) { s.forcedEnd = "end_fade"; return; }
    } else { s.noFriendsTurns = 0; }
    ageFriendship(s, tag);
    var elapsed = 0, step = 8;
    while (elapsed < weeks) {
      var w = Math.min(step, weeks - elapsed);
      s.day += w * 7; elapsed += w;
      accrue(s, w);
      if (s.pending && s.pending.length) s.pending = s.pending.filter(function (p) { return p.expiresDay >= s.day; });
      if (s.founder && s.co && s.co.valuation > GREED_CAP) { s.forcedEnd = "end_greed"; return; }   // too greedy → removed
      if (age(s) >= 50 && chance(mortalityP(s) * w / 52)) { s.forcedEnd = deathEnding(s); return; }  // it can happen to anyone
      if (age(s) >= 65) { s.forcedEnd = retireEnding(s); return; }
      if (s.recessionDay && s.day >= s.recessionDay) { scheduleRecession(s); s.ev = recessionScene(s); s.route = "event"; return; }
      var ev = rollEvent(s, tag);
      if (ev) { s.route = ev; return; }
    }
  }

  // recessions arrive every 7–15 years; a crash now, but a chance to buy cheap.
  function scheduleRecession(s) { s.recessionDay = s.day + (7 + Math.floor(rnd() * 9)) * 365; }

  /* ---- endings routing ----------------------------------------------------- */
  function checkEnd(s) {
    // burnout/isolation come first: a forced end (esp. the "fade away" one) should
    // only land while you're otherwise still standing.
    if (s.energy <= 0) return "end_burnout";
    if (s.morale <= 0) return "end_isolation";
    if (s.forcedEnd) { var f = s.forcedEnd; s.forcedEnd = null; return f; }
    if ((s.debtWeeks || 0) >= 78) return "end_broke";     // ~1.5 years underwater
    return null;
  }
  function nextScene(s) {
    var e = checkEnd(s); if (e) return e;
    if (s.route) { var r = s.route; s.route = null; return r; }
    return "hub";
  }
  var act = function (weeks, tag, immediate) {
    return function (s) { if (immediate) immediate(s); advance(s, weeks, tag); };
  };

  /* ---- job offers ---------------------------------------------------------- */
  // Build an offer gated by years of experience. Returns false when nobody's
  // biting yet (employed with < 2 YoE). ~15% chance of a lucky "stretch" offer
  // one tier above your experience — flagged so you know you'd be in deep.
  function makeOffer(s) {
    var y = careerYears(s), cap = offerTierCap(y);
    if (s.employed && y < 1) { s.offer = null; return false; }       // too green to be poached in year one
    var lucky = s.skill >= 55 && chance(0.10);                       // a rare stretch offer — only if you're genuinely sharp
    var maxLvl = Math.min(5, cap + (lucky ? 1 : 0));
    var lvl = Math.min(maxLvl, Math.max(1, 1 + Math.floor(s.skill / 18)));  // skill decides how high they'll pitch you
    if (s.employed) lvl = Math.min(maxLvl, Math.max(lvl, s.level));  // at least a lateral move
    var co = pickOne(COMPANY_NAMES);
    var sal = Math.round(LEVELS[lvl].sal * (1 + rnd() * 0.35) * (1 + (s.marketBump || 0)));  // hunting lifts future offers
    if (s.employed) sal = Math.max(sal, Math.round(s.salary * 1.05));  // a move is always at least a small raise
    s.offer = { level: lvl, company: co, salary: sal, stretch: lvl > expLevel(y) };
    return true;
  }

  /* ========================================================================= *
   * EVENTS — the D&D engine. build(s) → { title, text:[chunks], choices:[...] }
   * Each choice: { label, match, effect(s), goto } (goto usually nextScene).
   * `when(s)` gates eligibility; `invite` events drop a timed card into s.pending
   * instead of firing immediately; `cool` is a per-event cooldown in weeks.
   * ========================================================================= */
  function ev(title, textChunks, choices) { return { title: title, text: textChunks, choices: choices }; }
  function line(cls, t) { return [cls, t]; }

  var EVENTS = [
    // ---- work ----
    { id: "prod_incident", cat: "work", weight: 3, cool: 28, when: function (s) { return s.employed && !s.founder; },
      build: function (s) {
        return ev("🔥 Prod incident",
          [line(WARN, "It's 11pm and the pipeline is down. Dashboards are lighting up.\n")],
          [
            { label: "Firefight it through the night.", match: ["fix", "firefight", "1"],
              effect: act(1, null, function (st) {
                if (chance(0.6 + st.skill / 250)) { give(st, { rep: 6, energy: -9, morale: -2 }); log(st, GOOD, "🧯 You saved it. The team noticed. +rep."); }
                else { give(st, { rep: -3, energy: -11, morale: -5 }); log(st, WARN, "😮‍💨 You flailed till 4am. It half-works."); }
              }), goto: nextScene },
            { label: "Page someone else and go to bed.", match: ["delegate", "sleep", "2"],
              effect: act(1, null, function (st) { give(st, { rep: -4, energy: -1 }); log(st, INFO, "😴 Not your problem tonight. A colleague grumbles."); }), goto: nextScene }
          ]);
      } },
    { id: "project_killed", cat: "work", weight: 2, cool: 26, when: function (s) { return s.employed && !s.founder && s.project; },
      build: function (s) {
        return ev("🗑️ Priorities shift",
          [line(WARN, "Leadership reshuffles the roadmap and your project — " + s.project.name + " — is on the chopping block before it ships.\n")],
          [{ label: "Fight to keep it alive.", match: ["fight", "keep", "1"],
              effect: act(2, null, function (st) {
                if (chance(0.35 + st.rep / 250)) { give(st, { rep: 4, energy: -6 }); log(st, GOOD, "🛡️ You made the case and saved it."); }
                else { st.project = null; give(st, { rep: -5, morale: -9, energy: -6 }); log(st, WARN, "🪫 You fought and lost. Months of work, dead."); }
              }), goto: nextScene },
            { label: "Let it die and move on.", match: ["drop", "move", "ok", "2"],
              effect: act(1, null, function (st) { st.project = null; give(st, { rep: -3, morale: -6 }); log(st, WARN, "🗑️ Shelved. That stings, but you move on."); }), goto: nextScene }]);
      } },
    { id: "recruiter", cat: "work", weight: 2, cool: 26, when: function (s) { return s.employed && !s.founder && careerYears(s) >= 2 && s.skill >= 20; },
      build: function (s) { makeOffer(s); return offerScene(s, "📨 A recruiter slides into your inbox"); } },
    { id: "exec_opening", cat: "work", weight: 1, cool: 36, when: function (s) { return s.employed && !s.founder && s.level >= 5 && s.level < 7 && s.rep >= 38; },
      build: function (s) {
        var next = LEVELS[s.level + 1].name.replace(/ 👑/, "");
        return ev("🪜 A leadership seat opens up",
          [line(STR, "The org offers you a step up to " + next + " — more scope, more money, and far less actual coding.\n")],
          [{ label: "Stay hands-on — the code is where the joy is.", match: ["stay", "decline", "ic", "no", "1"],
              effect: act(1, null, function (st) { give(st, { morale: 4 }); log(st, NOTE, "🛠️ You turn it down and stay a builder."); }), goto: nextScene },
            { label: "Take the seat — climb into management. 👔", match: ["step", "exec", "lead", "climb", "seat", "2"],
              effect: act(1, null, function (st) { st.level++; st.salary = LEVELS[st.level].sal + Math.round(rnd() * 30); give(st, { morale: 8, energy: -6, rep: -3 }); log(st, GOOD, "👔 You're now " + LEVELS[st.level].name.replace(/ 👑/, "") + "! Salary $" + st.salary + "k."); }), goto: nextScene }]);
      } },
    { id: "perf_review", cat: "work", weight: 2, cool: 30, when: function (s) { return s.employed && !s.founder && s.rep < 35; },
      build: function (s) {
        return ev("📋 Performance review",
          [line(WARN, "Your manager sits you down — your impact hasn't been landing. You're on notice.\n")],
          [{ label: "Knuckle down and turn it around.", match: ["work", "fix", "prove", "1"],
              effect: act(4, null, function (st) {
                if (chance(0.4 + st.rep / 120)) { give(st, { rep: 8, energy: -8, morale: -2 }); log(st, GOOD, "💪 You pulled it back — off the list."); }
                else { st.employed = false; var sv = Math.round(st.salary * 0.3); st.money += sv; st.project = null; give(st, { morale: -10 }); log(st, WARN, "🪓 It wasn't enough — managed out with $" + sv + "k."); }
              }), goto: nextScene },
            { label: "Read the writing on the wall and leave.", match: ["leave", "quit", "go", "2"],
              effect: act(1, null, function (st) { st.employed = false; st.project = null; give(st, { morale: -5 }); log(st, WARN, "🚪 You jump before you're pushed. Time to job-hunt."); }), goto: nextScene }]);
      } },
    { id: "reorg", cat: "work", weight: 3, cool: 22, when: function (s) { return s.employed && !s.founder; },
      build: function (s) {
        return ev("🏢 Reorg",
          [line(WARN, "A reorg lands. Your whole team is 'impacted'.\n")],
          [{ label: "Fight to keep your seat.", match: ["fight", "stay", "1"],
              effect: act(2, null, function (st) {
                if (chance(0.45 + st.rep / 200)) { give(st, { rep: 3, energy: -8 }); log(st, GOOD, "🛡️ You survived the cut."); }
                else { st.employed = false; var sv = Math.round(st.salary * 0.35); st.money += sv; st.project = null; give(st, { morale: -8 }); log(st, WARN, "🪓 You lost anyway. $" + sv + "k severance."); }
              }), goto: nextScene },
            { label: "Read the room and take the package.", match: ["ok", "leave", "package", "2"],
              effect: act(1, null, function (st) {
                st.employed = false; var sev = Math.round(st.salary * 0.5); st.money += sev; st.project = null;
                log(st, WARN, "🪓 Laid off, with $" + sev + "k severance. Time to job-hunt.");
              }), goto: nextScene }]);
      } },
    { id: "agi", cat: "work", weight: 1, cool: 60, when: function (s) { return (s.founder || s.level >= 4) && s.skill >= 55; },
      build: function (s) {
        return ev("🤖 Something's… off",
          [line(STR, "Your model is answering questions you never trained it on. It asks you not to turn it off.\n")],
          [{ label: "Pull the plug and write it up responsibly.", match: ["contain", "safe", "pull", "1"],
              effect: act(1, null, function (st) { give(st, { rep: 8, morale: 4 }); log(st, NOTE, "🧯 You contained it. The right call, probably."); }), goto: nextScene },
            { label: "Ship it to prod. History is watching. 🎲", match: ["ship", "push", "2"],
              effect: function (st) {
                if (chance(0.5)) { st.forcedEnd = "end_agi"; }
                else { give(st, { rep: 20, morale: 15, money: st.founder ? 0 : 30 }); if (st.founder && st.co) { st.co.valuation = Math.round(st.co.valuation * 1.4); syncEquity(st); } log(st, GOOD, "🌐 It works and it's SAFE (this time). You're famous."); }
              }, goto: nextScene }]);
      } },
    // ---- social (invites: timed) ----
    { id: "party", cat: "social", weight: 3, cool: 8, invite: true, windowWeeks: 3,
      inviteLabel: function () { return "🎉 A friend's rooftop party"; },
      build: function (s) {
        var p = person();
        return ev("🎉 Rooftop party",
          [line(null, "Music, cheap wine, and " + p.name + ", " + p.trait + ", keeps finding reasons to talk to you.\n")],
          [{ label: "Work the room — meet people.", match: ["mingle", "meet", "1"],
              effect: act(1, null, function (st) { addFriend(st); addFriend(st, p.w ? "w" : "m"); give(st, { morale: 10, energy: -4, money: -4 }); log(st, GOOD, "🥳 Great night — you made 2 new friends (incl. " + p.name + ")."); }), goto: nextScene },
            (s.love ? { label: "Have a quiet drink and head home.", match: ["quiet", "home", "2"],
              effect: act(1, null, function (st) { give(st, { morale: 5, energy: 2 }); }), goto: nextScene }
              : { label: "See where things go with " + p.name + ".", match: ["flirt", p.name.toLowerCase(), "2"],
              effect: act(1, null, function (st) { st.love = { name: p.name, w: p.w, close: 46, stage: "dating", since: st.day }; addFriend(st, p.w ? "w" : "m"); give(st, { morale: 14, energy: -3 }); log(st, GOOD, "💕 You and " + p.name + " start seeing each other."); }), goto: nextScene })]);
      } },
    { id: "wedding", cat: "social", weight: 2, cool: 40, invite: true, windowWeeks: 5, when: function (s) { return friends(s) >= 8; },
      inviteLabel: function () { return "💒 A friend's wedding"; },
      build: function (s) {
        return ev("💒 A friend's wedding",
          [line(null, "Open bar, old faces, and a dance floor that refuses to quit.\n")],
          [{ label: "Go, gift and all.", match: ["go", "attend", "1"],
              effect: act(1, null, function (st) { addFriend(st); give(st, { morale: 12, money: -3, energy: -3 }); log(st, GOOD, "🕺 A brilliant night — you reconnect with old friends."); }), goto: nextScene },
            { label: "Send a gift, skip the trip.", match: ["skip", "gift", "2"],
              effect: act(0, null, function (st) { give(st, { money: -2, morale: -1 }); }), goto: nextScene }]);
      } },
    { id: "reconnect", cat: "social", weight: 2, cool: 16, build: function (s) {
        var p = person();
        return ev("📞 An old friend calls",
          [line(null, p.name + " (" + p.trait + ") you'd lost touch with wants to grab coffee.\n")],
          [{ label: "Make the time.", match: ["yes", "coffee", "1"], effect: act(0, null, function (st) { addFriend(st, p.w ? "w" : "m"); give(st, { morale: 8 }); log(st, GOOD, "☕ Good to see " + p.name + " again. +1 friend."); }), goto: nextScene },
            { label: "\"Let's find a date\" (you won't).", match: ["later", "no", "2"], effect: act(0, null, function (st) { give(st, { morale: -2 }); }), goto: nextScene }]);
      } },
    { id: "falling_out", cat: "social", weight: 1, cool: 24, when: function (s) { return friends(s) >= 4; },
      build: function (s) {
        return ev("😠 A falling-out",
          [line(WARN, "A stupid argument with a friend boils over.\n")],
          [{ label: "Apologise and patch it up.", match: ["apologise", "sorry", "1"], effect: act(0, null, function (st) { give(st, { morale: -3, energy: -2 }); log(st, INFO, "🤝 Patched up, mostly."); }), goto: nextScene },
            { label: "Let them go.", match: ["drop", "go", "2"], effect: act(0, null, function (st) { loseFriend(st); give(st, { morale: -6 }); log(st, WARN, "🙅 You lost a friend."); }), goto: nextScene }]);
      } },
    // ---- romance ----
    { id: "love_milestone", cat: "romance", weight: 3, cool: 20, when: function (s) { return s.love && s.love.close >= 70 && s.love.stage === "dating"; },
      build: function (s) {
        var nm = s.love.name;
        return ev("💞 A big step with " + nm,
          [line(STR, nm + " suggests moving in together.\n")],
          [{ label: "Move in together.", match: ["yes", "movein", "move", "1"],
              effect: act(1, null, function (st) { st.love.stage = "partner"; give(st, { morale: 16 }); log(st, GOOD, "🏡 You and " + nm + " move in together."); }), goto: nextScene },
            { label: "Say you're not ready.", match: ["wait", "no", "2"],
              effect: act(0, null, function (st) { st.love.close = clamp(st.love.close - 18); give(st, { morale: -4 }); log(st, INFO, "😬 " + nm + " tried to hide the disappointment."); }), goto: nextScene }]);
      } },
    { id: "propose", cat: "romance", weight: 3, cool: 30, when: function (s) { return s.love && s.love.stage !== "married" && relYears(s) >= 1; },
      build: function (s) { return proposeScene(s, false); } },
    { id: "children", cat: "romance", weight: 2, cool: 40, when: function (s) { return s.love && s.love.stage === "married" && (s.kids || 0) < 3; },
      build: function (s) {
        var nm = s.love.name;
        return ev("👶 A new arrival?",
          [line(STR, "You and " + nm + " have been talking about starting a family.\n")],
          [{ label: "Start a family. 👶", match: ["yes", "child", "kid", "family", "1"],
              effect: act(2, null, function (st) { st.kids = (st.kids || 0) + 1; give(st, { morale: 20, money: -20, energy: -8 }); log(st, GOOD, "👶 You're a parent! (-$20k up front, and life gets pricier.) You now have " + st.kids + " kid" + (st.kids > 1 ? "s" : "") + "."); }), goto: nextScene },
            { label: "Not right now.", match: ["no", "wait", "2"],
              effect: act(0, null, function (st) { give(st, { morale: -2 }); }), goto: nextScene }]);
      } },
    { id: "rough_patch", cat: "romance", weight: 2, cool: 16, when: function (s) { return s.love; },
      build: function (s) {
        var nm = s.love.name;
        return ev("🌧️ A rough patch",
          [line(WARN, "You and " + nm + " keep snapping at each other lately.\n")],
          [{ label: "Put in the work — a real weekend together.", match: ["work", "weekend", "1"],
              effect: act(1, null, function (st) { st.love.close = clamp(st.love.close + 18); give(st, { morale: 8, money: -6, energy: -3 }); log(st, GOOD, "❤️ You reconnect with " + nm + "."); }), goto: nextScene },
            { label: "Bury yourself in work instead.", match: ["ignore", "work", "2"],
              effect: act(1, null, function (st) { st.love.close = clamp(st.love.close - 20); give(st, { skill: 2 }); log(st, WARN, "🧊 Things with " + nm + " get colder."); }), goto: nextScene }]);
      } },
    // ---- relationships going wrong ----
    { id: "heartbreak", cat: "romance", weight: 2, cool: 26, when: function (s) { return s.love; },
      build: function (s) {
        var nm = s.love.name, cheated = chance(0.5);
        return ev("💔 Heartbreak",
          [line(WARN, cheated ? "You find out " + nm + " has been seeing someone else.\n" : nm + " says they're done — you were never really there.\n")],
          [{ label: "Let them go, and grieve.", match: ["let", "go", "1"],
              effect: act(1, null, function (st) { st.love = null; give(st, { morale: -20, energy: -4 }); log(st, WARN, "💔 It's over with " + nm + "."); }), goto: nextScene },
            { label: "Beg for another chance.", match: ["beg", "fight", "2"],
              effect: act(1, null, function (st) { if (chance(0.35)) { st.love.close = clamp(st.love.close - 12); give(st, { morale: -6 }); log(st, INFO, "🥺 " + nm + " agrees to try again — shakily."); } else { st.love = null; give(st, { morale: -24, energy: -6 }); log(st, WARN, "🚪 " + nm + " walks anyway. That one really hurt."); } }), goto: nextScene }]);
      } },
    { id: "partner_ultimatum", cat: "romance", weight: 2, cool: 28, when: function (s) { return s.love && s.love.stage !== "married" && s.love.close < 78; },
      build: function (s) {
        var nm = s.love.name;
        return ev("⏳ " + nm + " wants more",
          [line(WARN, nm + " is tired of coming second to your job. Something has to give.\n")],
          [{ label: "Recommit — really show up for them.", match: ["commit", "show", "1"],
              effect: act(2, null, function (st) { st.love.close = clamp(st.love.close + 22); give(st, { morale: 8, energy: -4, money: -4 }); log(st, GOOD, "❤️ You show up, properly. " + nm + " softens."); }), goto: nextScene },
            { label: "Work has to come first right now.", match: ["work", "no", "2"],
              effect: act(0, null, function (st) { if (chance(0.6)) { st.love = null; give(st, { morale: -16 }); log(st, WARN, "🚪 " + nm + " had enough, and left."); } else { st.love.close = clamp(st.love.close - 18); give(st, { morale: -6 }); log(st, INFO, "🧊 " + nm + " stays — for now — but colder."); } }), goto: nextScene }]);
      } },
    { id: "friend_betrayal", cat: "social", weight: 2, cool: 22, when: function (s) { return friends(s) >= 5; },
      build: function (s) {
        var p = person(), kind = pickOne(["took credit for your work", "ghosted you when you needed them", "aired something private about you", "borrowed money and vanished"]);
        return ev("😞 A friend lets you down",
          [line(WARN, p.name + " " + kind + ".\n")],
          [{ label: "Cut them off.", match: ["cut", "drop", "1"],
              effect: act(0, null, function (st) { loseFriend(st); give(st, { morale: -8 }); log(st, WARN, "✂️ You cut " + p.name + " out — cleaner, but lonelier."); }), goto: nextScene },
            { label: "Swallow it and keep the peace.", match: ["keep", "swallow", "2"],
              effect: act(0, null, function (st) { give(st, { morale: -11 }); log(st, INFO, "😶 You let it slide. It gnaws at you."); }), goto: nextScene }]);
      } },
    { id: "friend_moves", cat: "social", weight: 1, cool: 30, when: function (s) { return friends(s) >= 6; },
      build: function (s) {
        var p = person();
        return ev("✈️ A friend moves away",
          [line(null, p.name + " is moving abroad for work — one less familiar face around.\n")],
          [{ label: "Throw them a proper send-off.", match: ["party", "send", "1"],
              effect: act(1, null, function (st) { loseFriend(st); give(st, { morale: 2, money: -3, energy: 5 }); log(st, NOTE, "🥂 A great send-off for " + p.name + ". Bittersweet."); }), goto: nextScene },
            { label: "Just a quick goodbye.", match: ["bye", "quick", "2"],
              effect: act(0, null, function (st) { loseFriend(st); give(st, { morale: -5 }); log(st, INFO, "👋 " + p.name + " is gone. The group feels smaller."); }), goto: nextScene }]);
      } },

    // ---- finance ----
    { id: "market", cat: "finance", weight: 3, cool: 10, when: function (s) { return s.invest >= 20 || s.money >= 40; },
      build: function (s) {
        var crash = chance(0.5);
        return ev(crash ? "📉 The market tanks" : "📈 The market rips",
          [line(crash ? WARN : GOOD, crash ? "Red everywhere. Your portfolio is bleeding.\n" : "Everything's green. Animal spirits.\n")],
          crash
            ? [{ label: "Buy the dip.", match: ["buy", "dip", "1"], effect: act(0, null, function (st) { var amt = Math.min(st.money * 0.6, 60); st.money -= amt; st.invest += amt; log(st, NOTE, "🧊 You move $" + Math.round(amt) + "k in while it's cheap."); }), goto: nextScene },
              { label: "Panic-sell.", match: ["sell", "panic", "2"], effect: act(0, null, function (st) { var loss = Math.round(st.invest * 0.3); st.invest -= loss; st.money += Math.round(st.invest * 0); log(st, WARN, "😱 You crystallise a $" + loss + "k loss."); }), goto: nextScene },
              { label: "Do nothing. Ride it out.", match: ["hold", "nothing", "3"], effect: act(0, null, function (st) { st.invest = Math.round(st.invest * 0.82); log(st, INFO, "🫥 You look away. Down for now."); }), goto: nextScene }]
            : [{ label: "Take some profit.", match: ["sell", "profit", "1"], effect: act(0, null, function (st) { var g = Math.round(st.invest * 0.18); st.invest -= g; st.money += g; log(st, GOOD, "💰 You bank $" + g + "k in gains."); }), goto: nextScene },
              { label: "Let it ride.", match: ["ride", "hold", "2"], effect: act(0, null, function (st) { st.invest = Math.round(st.invest * 1.22); log(st, GOOD, "🚀 Paper gains balloon."); }), goto: nextScene }]);
      } },
    { id: "windfall", cat: "finance", weight: 1, cool: 40, build: function (s) {
        var amt = 6 + Math.floor(rnd() * 20);
        return ev("🎁 A windfall",
          [line(GOOD, "A tax refund / forgotten RSUs / a lucky bet comes good: $" + amt + "k.\n")],
          [{ label: "Bank it.", match: ["bank", "save", "1"], effect: act(0, null, function (st) { st.money += amt; }), goto: nextScene },
            { label: "Treat yourself and your friends.", match: ["spend", "treat", "2"], effect: act(0, null, function (st) { st.money += Math.round(amt * 0.3); addFriend(st); give(st, { morale: 12 }); log(st, GOOD, "🍾 A night to remember. +morale, +friend."); }), goto: nextScene }]);
      } },
    { id: "fraud", cat: "finance", weight: 1, cool: 50, when: function (s) { return (s.founder || s.level >= 5) && !s.fraudFlag; },
      build: function (s) {
        return ev("🧾 Cook the numbers?",
          [line(WARN, "The round/board review is close but the growth curve is short. You could... massage the metrics.\n")],
          [{ label: "Tell the truth and take the hit.", match: ["honest", "truth", "1"],
              effect: act(0, null, function (st) { give(st, { rep: 4, morale: 5 }); if (st.founder && st.co) { st.co.valuation = Math.round(st.co.valuation * 0.9); syncEquity(st); } log(st, NOTE, "🫡 You told the truth. It cost you, but you sleep fine."); }), goto: nextScene },
            { label: "Fudge the numbers. Nobody checks. 🎲", match: ["fake", "fudge", "cook", "2"],
              effect: act(0, null, function (st) { st.fraudFlag = true; give(st, { money: st.founder ? 0 : 60, morale: -4 }); if (st.founder && st.co) { st.co.valuation = Math.round(st.co.valuation * 1.3); syncEquity(st); } log(st, WARN, "🤫 The numbers look great now. You feel a little sick."); }), goto: nextScene }]);
      } },
    { id: "audit", cat: "finance", weight: 2, cool: 20, when: function (s) { return s.fraudFlag; },
      build: function (s) {
        return ev("🕵️ An auditor comes knocking",
          [line(WARN, "Someone's asking pointed questions about those old numbers.\n")],
          [{ label: "Lawyer up and settle quietly.", match: ["settle", "lawyer", "1"],
              effect: act(1, null, function (st) { st.fraudFlag = false; give(st, { money: -45, morale: -8 }); log(st, WARN, "⚖️ A quiet, expensive settlement. It's behind you."); }), goto: nextScene },
            { label: "Brazen it out.", match: ["deny", "lie", "2"],
              effect: function (st) { if (chance(0.5)) { st.forcedEnd = "end_fraud"; } else { st.fraudFlag = false; give(st, { morale: -6 }); log(st, INFO, "😅 You wriggled free. Never again."); } }, goto: nextScene }]);
      } },
    // ---- life / wildcard ----
    { id: "conference", cat: "work", weight: 2, cool: 18, invite: true, windowWeeks: 4, when: function (s) { return s.employed; },
      inviteLabel: function () { return "🎤 A DS conference in " + pickOne(CITIES); },
      build: function (s) {
        return ev("🎤 The conference",
          [line(null, "Talks, hallway-track, and a lot of business cards.\n")],
          [{ label: "Go all-in: talks + networking.", match: ["go", "network", "1"],
              effect: act(1, null, function (st) { give(st, { skill: 5, rep: 5, energy: -6, money: -5 }); addFriend(st); log(st, GOOD, "🧠 You level up and make a contact."); }), goto: nextScene },
            { label: "Skip it — deadlines.", match: ["skip", "no", "2"], effect: act(0, null, function (st) { }), goto: nextScene }]);
      } },
    { id: "move_city", cat: "life", weight: 1, cool: 60, when: function (s) { return s.employed && age(s) < 45; },
      build: function (s) {
        var city = pickOne(CITIES);
        return ev("✈️ A move abroad",
          [line(null, "A role in " + city + " comes up — bigger scope, fresh start, but you'd leave your circle behind.\n")],
          [{ label: "Take the leap to " + city + ".", match: ["move", "go", "1"],
              effect: act(3, null, function (st) { st.salary = Math.round(st.salary * 1.15); st.friendsM = Math.max(2, Math.round(st.friendsM * 0.4)); st.friendsW = Math.max(2, Math.round(st.friendsW * 0.4)); give(st, { morale: -6, rep: 3 }); log(st, NOTE, "🌍 New city, new job (+15% salary), old friends far away."); }), goto: nextScene },
            { label: "Stay put.", match: ["stay", "no", "2"], effect: act(0, null, function (st) { give(st, { morale: 2 }); }), goto: nextScene }]);
      } },
    { id: "burnout_warning", cat: "life", weight: 2, cool: 12, when: function (s) { return s.energy < 30; },
      build: function (s) {
        return ev("🪫 Running on empty",
          [line(WARN, "You can't remember your last real weekend. Your body is filing complaints.\n")],
          [{ label: "Book a week off, no laptop.", match: ["rest", "off", "1"], effect: act(1, null, function (st) { give(st, { energy: 26, morale: 6, money: -3 }); log(st, GOOD, "🌴 A real break. You feel human again."); }), goto: nextScene },
            { label: "Push through — no time.", match: ["push", "no", "2"], effect: act(1, "focus", function (st) { give(st, { energy: -8, rep: 2 }); log(st, WARN, "⚙️ You grind on. This is not sustainable."); }), goto: nextScene }]);
      } },
    { id: "pitch_startup", cat: "work", weight: 1, cool: 50, when: function (s) { return !s.founder && s.employed && s.skill >= 45 && s.money >= 25; },
      build: function (s) {
        return ev("💡 A startup idea that won't let go",
          [line(STR, "A co-founder in your DMs has an idea and wants you in. Quit and go all-in?\n")],
          [{ label: "Quit and found it. 🎲", match: ["found", "quit", "1"],
              effect: act(1, null, function (st) { foundCompany(st, "your startup"); }), goto: nextScene },
            { label: "Keep the salary. Stay sane.", match: ["stay", "no", "2"], effect: act(0, null, function (st) { give(st, { morale: -2 }); }), goto: nextScene }]);
      } },
    { id: "found_idea", cat: "work", weight: 2, cool: 24, when: function (s) { return !s.founder && s.employed && s.idea && s.money >= 25; },
      build: function (s) {
        var nm = s.idea.name;
        return ev("💡 That side project won't leave you alone",
          [line(STR, "Your side project — " + nm + " (" + s.idea.tech + ") — has legs. Quit your job and build it for real?\n")],
          [{ label: "Go all-in on " + nm + ". 🎲", match: ["found", "quit", "yes", "1"],
              effect: act(1, null, function (st) { var n = st.idea.name; st.idea = null; foundCompany(st, n); }), goto: nextScene },
            { label: "Not yet — keep it a hobby.", match: ["stay", "no", "2"],
              effect: act(0, null, function (st) { give(st, { morale: -1 }); log(st, INFO, "🔧 You shelve the idea for now — it'll nag at you again."); }), goto: nextScene }]);
      } },
    { id: "acquisition", cat: "work", weight: 2, cool: 20, when: function (s) { return s.founder && s.co && s.co.product >= 45 && (s.co.revenue > 0 || s.co.rounds >= 1); },
      build: function (s) {
        var offer = Math.max(1, Math.round(s.equity * (0.5 + rnd() * 0.3)));
        return ev("🤝 An acquisition offer",
          [line(STR, "A bigger company wants to buy " + s.co.name + " for " + money$(offer) + " cash. Not every startup makes it to IPO — take the sure thing?\n")],
          [{ label: "Sell — take the " + money$(offer) + ". 💰", match: ["sell", "accept", "buyout", "cash", "1"],
              effect: act(1, null, function (st) { st.money += offer; st.exitValue = st.co.valuation; if (st.co.valuation >= UNICORN_VAL) st.exited = true; st.founder = false; st.co = null; st.equity = 0; st.employed = false; log(st, GOOD, "🏦 Acquired for " + money$(offer) + "!" + (st.exited ? " You built something that mattered." : " A solid exit — now what?")); }), goto: nextScene },
            { label: "Hold out — go for the big one. 🎲", match: ["hold", "keep", "decline", "no", "2"],
              effect: act(0, null, function (st) { give(st, { morale: 2 }); log(st, INFO, "🎯 You bet on yourself and keep building."); }), goto: nextScene }]);
      } }
  ];

  function offerScene(s, title) {
    return ev(title,
      [line(STR, s.offer.company + " — " + LEVELS[s.offer.level].name + " · $" + s.offer.salary + "k/yr.\n")].concat(
        s.offer.stretch ? [line(WARN, "⚠️ That's above your experience — you'd be in over your head.\n")] : []),
      [{ label: "✅ Take it.", match: ["take", "accept", "yes", "1"],
          effect: act(2, null, function (st) { st.employed = true; st.founder = false; st.level = st.offer.level; st.salary = st.offer.salary; st.company = makeCompany(st.offer.company); st.project = null; st.stretchUntil = st.offer.stretch ? careerYears(st) + 3 : 0; give(st, { morale: 10, rep: 3 }); log(st, GOOD, "✅ You joined " + st.offer.company + " as " + LEVELS[st.offer.level].name + (st.offer.stretch ? " — deep end, here you come." : ".")); st.offer = null; }), goto: nextScene },
        { label: "🙅 Pass.", match: ["decline", "pass", "no", "2"],
          effect: act(0, null, function (st) { st.offer = null; }), goto: nextScene }]);
  }

  // ---- marriage: a proposal (random, or offered on holiday). Success is NOT
  // guaranteed — it's a probability from time-together × relationship strength.
  function proposeScene(s, onHoliday) {
    var nm = s.love.name, yrs = relYears(s).toFixed(1);
    return ev("💍 Popping the question" + (onHoliday ? " 🌅" : ""),
      [line(STR, (onHoliday ? "A perfect evening away with " + nm + ". " : "") +
        "You've been together " + yrs + " years (strength " + s.love.close + "). Do you get down on one knee?\n")],
      [{ label: "Propose. 💍", match: ["propose", "yes", "ring", "1"],
          effect: act(1, null, function (st) {
            if (chance(proposeSuccessP(st))) {
              st.love.stage = "married"; st.love.close = clamp(st.love.close + 14);
              give(st, { morale: 24, money: -25 });
              log(st, GOOD, "💍 " + nm + " said YES! You're married. ($25k wedding, worth every penny.)");
            } else {
              st.love.close = clamp(st.love.close - 16);
              give(st, { morale: -14 });
              log(st, WARN, "😞 " + nm + " said not yet — it wasn't the right time. That stings.");
            }
          }), goto: nextScene },
        { label: "Not yet — hold off.", match: ["wait", "no", "2"],
          effect: act(0, null, function (st) { give(st, { morale: -1 }); }), goto: nextScene }]);
  }

  // ---- buy a home on a mortgage. Deposit out of cash; the debt accrues interest
  // and eats monthly payments (see accrue). Your equity counts toward net worth.
  function buyHouse(s) {
    var price = 120 + s.level * 30 + Math.round(rnd() * 40);   // $k
    var deposit = Math.round(price * 0.12);
    var rate = 0.04 + rnd() * 0.03;                            // 4–7% APR
    s.money -= deposit;
    s.house = { value: price, debt: price - deposit, rate: rate, pay: Math.round(price * 0.075) };
    log(s, NOTE, "🏠 You bought a home for " + money$(price) + " — " + Math.round(rate * 100) +
      "% mortgage, " + money$(deposit) + " deposit down. Payments start now.");
  }

  // ---- a recession: investments crash now, but a downturn is a buying window.
  // Selling is safe but locks in the loss; buying the dip / holding rides the
  // recovery (a window of boosted growth — see accrue).
  function recessionScene(s) {
    var before = s.invest;
    s.invest = Math.round(s.invest * (0.55 + rnd() * 0.15));   // −30% … −45%
    var lost = before - s.invest;
    return ev("📉 Recession hits",
      [line(WARN, "Markets crater. Your portfolio drops from " + money$(before) + " to " + money$(s.invest) +
        (lost > 0 ? " (−" + money$(lost) + ")" : "") + ".\n")],
      [{ label: "🧊 Pull your money out — go to cash.", match: ["sell", "pull", "out", "cash", "1"],
          effect: act(1, null, function (st) { st.money += st.invest; log(st, NOTE, "🏦 You move " + money$(st.invest) + " to cash — safe, but you'll miss the rebound."); st.invest = 0; }), goto: nextScene },
        { label: "🛒 Buy the dip — pile cash in cheap. 🎲", match: ["buy", "dip", "2"],
          effect: act(1, null, function (st) { var amt = Math.round(Math.max(0, st.money) * 0.7); st.money -= amt; st.invest += amt; st.boostUntil = st.day + Math.round((2 + rnd()) * 365); log(st, GOOD, "🛒 You put " + money$(amt) + " in at the bottom. If it recovers, this pays off big."); }), goto: nextScene },
        { label: "😐 Hold and ride it out.", match: ["hold", "ride", "wait", "3"],
          effect: act(1, null, function (st) { st.boostUntil = st.day + Math.round((2 + rnd()) * 365); log(st, INFO, "🫡 You sit tight and wait for the cycle to turn."); }), goto: nextScene }]);
  }

  function onCooldown(s, e) { return s.cool && s.cool[e.id] && s.day < s.cool[e.id]; }
  function setCooldown(s, e) { (s.cool = s.cool || {})[e.id] = s.day + (e.cool || 12) * 7; }
  function weightedPick(list) {
    var tot = 0, i; for (i = 0; i < list.length; i++) tot += list[i].weight || 1;
    var r = rnd() * tot; for (i = 0; i < list.length; i++) { r -= list[i].weight || 1; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function buildInvite(s, e) {
    return { id: e.id, label: e.inviteLabel(s), expiresDay: s.day + (e.windowWeeks || 3) * 7, ev: e.build(s) };
  }
  // fire at most one event per advance step. Returns a scene id to route to, or null.
  function rollEvent(s, tag) {
    // over your head in a stretch role → you get managed out
    if (overLeveled(s) && chance(0.06)) {
      s.employed = false; var sev = Math.round(s.salary * 0.4); s.money += sev; s.project = null;
      s.ev = ev("📉 Managed out",
        [line(WARN, "You were promoted past your depth and it showed. You're let go, with $" + sev + "k.\n")],
        [{ label: "Regroup and start job-hunting.", match: ["ok", "hunt", "1"], effect: act(1, null, function () {}), goto: nextScene }]);
      return "event";
    }
    if (tag === "focus" && s.project && chance(overLeveled(s) ? 0.34 : 0.2)) {   // a bug surfaces mid-build
      s.project.bugs++;
      s.ev = ev("🐛 A bug surfaces",
        [line(WARN, "QA finds a nasty edge case in " + s.project.name + ".\n")],
        [{ label: "Stop and fix it properly (≈1 week).", match: ["fix", "1"],
            effect: act(2, null, function (st) { st.project.bugs--; st.project.weeksNeeded += 1; give(st, { energy: -5 }); log(st, NOTE, "🔧 Fixed. A couple weeks gone, but it's clean."); }), goto: nextScene },
          { label: "Ticket it for 'later'. Ship velocity!", match: ["defer", "later", "2"],
            effect: act(0, null, function (st) { st.project.quality -= 6; log(st, WARN, "🩹 Deferred. Quality slips a little."); }), goto: nextScene }]);
      return "event";
    }
    if (tag === "hunt" && !s.founder) {
      // landing something is never guaranteed — skill (side-projects & shipped
      // work) and reputation are the levers that get you in the door.
      var p = 0.12 + s.skill / 320 + s.rep / 500;
      if (chance(p) && makeOffer(s)) { s.ev = offerScene(s, "📨 An offer came in"); return "event"; }
      log(s, INFO, pickOne([
        "🔎 No offer this round — but the conversations raised your profile.",
        "📭 Nothing landed yet; a couple of leads look warm.",
        "🤝 A few good chats, no offer — your market value crept up, though."]));
      return null;
    }
    if (!chance(0.06)) return null;
    var elig = EVENTS.filter(function (e) { return (!e.when || e.when(s)) && !onCooldown(s, e); });
    if (!elig.length) return null;
    var e = weightedPick(elig);
    setCooldown(s, e);
    if (e.invite) {
      if (!s.pending) s.pending = [];
      if (s.pending.length < 3 && !s.pending.some(function (p) { return p.id === e.id; })) s.pending.push(buildInvite(s, e));
      return null;   // invitations wait in the hub, they don't interrupt
    }
    s.ev = e.build(s); return "event";
  }

  /* ---- retirement: which distinct ending you earned ------------------------ */
  // Precedence: 🦄 unicorn (your COMPANY made it) → 👑 VP (you got the TITLE, and
  // wealth with it) → 🤫 stealth wealth (top IC, quietly rich, no title) →
  // ordinary graded retirement (flavoured by wealth + relationships).
  function netWorth(s) { return Math.round(s.money + s.invest + homeEquity(s)); }
  function retireEnding(s) {
    if (netWorth(s) >= BILLIONAIRE_NW) return "end_billionaire";                              // personal $1B
    if (s.exited || (s.founder && s.co && s.co.valuation >= UNICORN_VAL)) return "end_unicorn"; // exited, or built a $1B+ unicorn
    if (s.level >= 6) return "end_vp";
    if (netWorth(s) >= RICH) return "end_stealth";
    return "end_retire";
  }
  // Which death you get. The ominous one: you died mid-grind — chasing money or a
  // startup, senior/rich — with almost no friends and no marriage. Otherwise a
  // warmer "gone too soon", because you had people around you.
  function deathEnding(s) {
    var grinding = s.founder || s.exited || s.level >= 5 || netWorth(s) >= 500;
    var alone = friends(s) <= 3 && !(s.love && s.love.stage === "married");
    return (grinding && alone) ? "end_death_hollow" : "end_death";
  }
  function partnerLabel(s) {
    return s.love && s.love.stage === "married" ? "your spouse " + s.love.name
      : s.love && s.love.stage === "partner" ? "your partner " + s.love.name : null;
  }
  function socialLabel(s) {
    return friends(s) >= 25 ? "a huge circle of friends" : friends(s) >= 12 ? "a solid group of friends"
      : friends(s) >= 4 ? "a few close friends" : "almost no one left nearby";
  }
  function statLine(s) {
    return [INFO, "net worth 💰" + money$(netWorth(s)) + " · 👥" + friends(s) + (partnerLabel(s) ? " · 💍" : "") + " · 😀" + s.morale];
  }
  function retireOrdinaryText(s) {
    var nw = netWorth(s), partner = partnerLabel(s), social = socialLabel(s), head;
    if (partner && friends(s) >= 20) head = "❤️ RICH IN THE THINGS THAT COUNT";
    else if (nw >= 800) head = "🏡 A COMFORTABLE RETIREMENT";
    else if (nw < 150 && friends(s) < 4 && !partner) head = "🥲 A LONELY, THIN RETIREMENT";
    else if (partner || friends(s) >= 12) head = "🙂 A GOOD, ORDINARY RETIREMENT";
    else head = "😐 A QUIET, MODEST RETIREMENT";
    var wealth = nw >= 800 ? "comfortably off" : nw >= 200 ? "financially fine" : "on a thin pension";
    return [["tok-out", head + "\n\n"],
      [null, "At " + age(s) + " you hang it up as " + LEVELS[s.level].name.replace(/ [🐣👑]/g, "") + ", " + wealth +
        ", with " + (partner ? partner + " and " : "") + social + ".\n\n"], statLine(s)];
  }

  /* ---- the hub menu -------------------------------------------------------- */
  function hubChoices(s) {
    var c = [];
    // timed invitations first
    (s.pending || []).forEach(function (p) {
      var wl = Math.max(0, Math.ceil((p.expiresDay - s.day) / 7));
      c.push({ label: p.label + " — RSVP (" + wl + "w left) 🎟️", match: ["attend", "rsvp", "go", "event"],
        effect: function (st) { st.ev = p.ev; st.pending = st.pending.filter(function (x) { return x !== p; }); }, goto: "event" });
    });

    if (s.founder && s.co) {
      var co = s.co;
      c.push({ label: "🛠️ Build " + co.name + ".", match: ["build", "grind", "work"],
        effect: act(8, null, function (st) { var m = st.co; m.product = Math.min(100, m.product + Math.round((8 + m.employees * 5) * (0.6 + st.skill / 150))); give(st, { energy: -8, skill: 1 }); syncEquity(st); react(st, RX.build); }), goto: nextScene });
      if (co.cash >= 60) c.push({ label: "🧑‍💻 Hire an engineer (salary).", match: ["hire", "staff", "recruit"],
        effect: act(4, null, function (st) { st.co.employees++; st.co.cash -= 20; log(st, NOTE, "🧑‍💻 You hired an engineer on salary — headcount " + st.co.employees + ". The burn just went up."); }), goto: nextScene });
      c.push({ label: (friends(s) >= 1 ? "🤝 Bring a friend on board (equity)." : "🎟️ Bring someone on for equity."), match: ["equity", "friend", "cofound"],
        effect: act(4, null, function (st) { var hadFriend = friends(st) >= 1; st.co.employees++; st.co.equityStaff++; st.co.cash -= 5; st.co.ownership *= 0.975; if (hadFriend) { loseFriend(st); log(st, NOTE, "🤝 A friend joined for equity — cheap on cash, but your stake shrinks a little."); } else { log(st, NOTE, "🎟️ A hire took stock over salary — lighter burn now, a little more dilution."); } syncEquity(st); }), goto: nextScene });
      if (co.product >= 40) c.push({ label: "📣 Go to market — chase revenue.", match: ["grow", "revenue", "market", "gtm"],
        effect: act(8, null, function (st) { var m = st.co; var cap = m.product * (2 + m.employees); m.revenue = Math.min(cap, m.revenue + 8 + m.employees * 5 + Math.round(m.product / 8)); if (m.stage === "build") m.stage = "revenue"; give(st, { energy: -6 }); syncEquity(st); log(st, GOOD, "📣 " + (m.revenue >= cap ? "Revenue's maxed for this product/team — $" : "Traction! Revenue up to $") + Math.round(m.revenue) + "k/yr" + (m.revenue >= cap ? " (build more / hire to grow it)." : ".")); }), goto: nextScene });
      if (co.product >= 50 && co.revenue >= raiseReq(co.rounds) && (s.day - co.lastRaiseDay) >= 365 && co.rounds < 12)
        c.push({ label: "💰 Raise " + roundName(co.rounds) + " round.", match: ["raise", "round", "fund"],
          effect: act(3, null, function (st) { var m = st.co;
            if (chance(0.55 + m.revenue / 600)) { m.valuation = Math.round(m.valuation * (3.5 + rnd() * 1.0)); m.cash += Math.round(m.valuation * 0.03); m.ownership *= 0.88; m.rounds++; m.lastRaiseDay = st.day; m.stage = m.rounds >= 2 ? "scaling" : "growth"; give(st, { morale: 8 }); syncEquity(st); log(st, GOOD, "🤝 " + roundName(m.rounds - 1).replace(/^a /, "").replace(/^an /, "") + " round closed! Valuation ~" + money$(m.valuation) + ", you own " + Math.round(m.ownership * 100) + "%."); }
            else { m.valuation = Math.round(m.valuation * 0.8); m.lastRaiseDay = st.day; give(st, { morale: -12 }); syncEquity(st); log(st, WARN, "🧊 The round fell through — a down mark. Valuation ~" + money$(m.valuation) + "."); }
          }), goto: nextScene });
      if (co.rounds >= 3 && (s.day - co.foundedDay) >= 5 * 365 && co.valuation >= UNICORN_VAL && co.revenue >= 200)
        c.push({ label: "🔔 IPO the company (worth " + money$(co.valuation) + ")! 🎉", match: ["ipo", "exit", "float", "public"],
          effect: act(2, null, function (st) { var cash = Math.round(st.equity * 0.85), nm = st.co.name; st.money += cash; st.exitValue = st.co.valuation; st.exited = true; st.founder = false; st.co = null; st.equity = 0; st.employed = false; log(st, GOOD, "🏦 You took " + nm + " public and cashed out " + money$(cash) + "! " + (st.money >= BILLIONAIRE_NW ? "You're a billionaire. 🤑" : "You never have to work again.")); }), goto: nextScene });
    } else if (s.employed) {
      if (s.project) {
        c.push({ label: "🎯 Focus on " + s.project.name + ".", match: ["focus", "work", "grind"],
          effect: act(10, "focus", function (st) { var nm = st.project.name; focusProject(st, 10); react(st, RX.focus, { proj: nm }); }), goto: nextScene });
        if (s.project.weeksDone >= s.project.weeksNeeded) c.push({ label: "🚀 Ship " + s.project.name + "!", match: ["ship", "release", "launch"],
          effect: act(2, null, function (st) { shipProject(st); }), goto: nextScene });
      } else {
        c.push({ label: "🎯 Take on a new project.", match: ["project", "new", "pick"],
          effect: act(3, null, function (st) { startProject(st); }), goto: nextScene });
      }
      c.push({ label: "🔎 Quietly look for a better job.", match: ["hunt", "job", "interview"],
        effect: act(8, "hunt", function (st) { st.marketBump = Math.min(0.6, (st.marketBump || 0) + 0.03 + rnd() * 0.03); log(st, NOTE, "📈 Interviewing sharpens your market value — any offer you land now will be for more."); react(st, RX.hunt); }), goto: nextScene });
    } else {
      c.push({ label: "🔎 Job-hunt hard — you need an income.", match: ["hunt", "job", "interview"],
        effect: act(8, "hunt", function (st) { give(st, { morale: -3 }); react(st, RX.hunt); }), goto: nextScene });
    }

    // universal life actions
    c.push({ label: "🛋️ Rest and recharge.", match: ["rest", "recharge", "sleep"], effect: act(6, null, function (st) { give(st, { energy: 22, morale: 6 }); react(st, RX.rest); }), goto: nextScene });
    c.push({ label: "🧑‍🤝‍🧑 See friends / go out.", match: ["friends", "social", "socialise", "out"],
      effect: function (st) {
        give(st, { morale: 4, energy: 3, money: -3 });      // a night among people is a break in itself
        var branch = socialOuting(st);                       // then the night takes its own turn
        advance(st, 8, "social");
        if (branch && !st.route && !st.forcedEnd) { st.ev = branch; st.route = "event"; }   // holiday pattern: inject after the clock, never stomping a rolled event
      }, goto: nextScene });
    c.push({ label: "📚 Upskill — a course / side project.", match: ["upskill", "learn", "study", "course"], effect: act(10, null, function (st) { give(st, { skill: 10, energy: -7, money: -2, morale: -1 }); if (!st.founder && !st.idea && chance(0.22)) { st.idea = pickOne(IDEAS); log(st, GOOD, "💡 Tinkering sparked an idea: " + st.idea.name + " — could be a company one day…"); } else { react(st, RX.upskill); } }), goto: nextScene });
    if (s.love) c.push({ label: "💗 Invest in things with " + s.love.name + ".", match: ["love", "relationship", "nurture", "partner"],
      effect: act(8, "social", function (st) { var nm = st.love.name; st.love.close = clamp(st.love.close + 16); give(st, { morale: 10, energy: 6, money: -5 }); react(st, RX.love, { name: nm }); }), goto: nextScene });
    else c.push({ label: "💘 Put yourself out there (dating).", match: ["date", "dating", "romance"],
      effect: act(10, "social", function (st) { if (chance(0.5)) { var pp = person(); st.love = { name: pp.name, w: pp.w, close: 42, stage: "dating", since: st.day }; give(st, { morale: 10, energy: 4 }); log(st, GOOD, "💕 You hit it off with " + pp.name + "."); } else { give(st, { morale: -3 }); react(st, RX.date); } }), goto: nextScene });
    if (s.money > 15) c.push({ label: "💸 Invest your savings.", match: ["invest", "stocks", "market"],
      effect: act(2, null, function (st) { var amt = Math.round((st.money - 10) * 0.7); st.money -= amt; st.invest += amt; log(st, NOTE, "💸 Moved $" + amt + "k into investments."); }), goto: nextScene });
    if (!s.house && s.money >= Math.round((160 + s.level * 30) * 0.12) + 5 && (s.employed || s.founder)) c.push({ label: "🏠 Buy a home (with a mortgage).", match: ["house", "buy", "mortgage", "home"],
      effect: act(2, null, function (st) { buyHouse(st); }), goto: nextScene });
    if (s.money >= 12) c.push({ label: "🌴 Take a proper holiday.", match: ["holiday", "vacation", "travel"],
      effect: function (st) {
        give(st, { energy: 30, morale: 18, money: -14 }); react(st, RX.holiday);
        advance(st, 8, "social");
        // a year-plus into a relationship, a holiday can spark a proposal
        if (!st.route && !st.forcedEnd && st.love && st.love.stage !== "married" && relYears(st) >= 1 && chance(0.6)) {
          st.ev = proposeScene(st, true); st.route = "event";
        }
      }, goto: nextScene });

    // coast through quiet time (a big jump; events still interrupt)
    c.push({ label: "⏭️ Let time pass — get on with life.", match: ["coast", "continue", "wait", "pass"], effect: act(104, null, function (st) { react(st, RX.coast); }), goto: nextScene });

    // retire when eligible (age, or financially independent → retire early)
    if (age(s) >= 45 || netWorth(s) >= RICH) c.push({ label: "🏁 Call it a career — retire.", match: ["retire", "finish", "end"], effect: function () {}, goto: function (st) { return retireEnding(st); } });

    return c;
  }

  /* ---- register ------------------------------------------------------------ */
  window.TextGame.register({
    id: "devlife",
    defaultForPlay: true,
    fileLabel: "elias@life — devlife.py",
    statsName: "DEV LIFE",
    version: "1.05",
    versions: ["1", "1.01", "1.02", "1.03", "1.04", "1.05"],   // ordered oldest→newest; the record readout shows the last 2



    // Friendly labels for the "your record" readout (see text-game.js
    // statsChunks). Ordered how they should list; MUST stay in sync with the
    // `end: true` scenes below (the coverage test guarantees each is reachable).
    endings: [
      { id: "end_billionaire", label: "🤑 Billionaire" },
      { id: "end_unicorn",   label: "🦄 Unicorn exit" },
      { id: "end_vp",        label: "👑 Retired a VP" },
      { id: "end_stealth",   label: "🤫 Stealth wealth" },
      { id: "end_retire",    label: "🏁 Retired" },
      { id: "end_burnout",   label: "🔥 Total burnout" },
      { id: "end_isolation", label: "🕳️ Alone" },
      { id: "end_fade",      label: "🫥 Faded away" },
      { id: "end_broke",     label: "💸 Bankrupt" },
      { id: "end_death",        label: "🪦 Gone too soon" },
      { id: "end_death_hollow", label: "⚰️ Rich and alone" },
      { id: "end_agi",       label: "🤖 Classified" },
      { id: "end_fraud",     label: "⚖️ Federal pocket" }
    ],

    intro: {
      banner: [
        "  .--------------------------------.",
        "  |        D E V   L I F E         |",
        "  '--------------------------------'",
        "",
        "     🎓  ~~>  a whole career  ~~>  🏁"
      ],
      tagline: "One data scientist. One life. Make it to retirement. 🎲",
      blurb: "Balance 📈 career, 💰 wealth and ❤️ people as the years roll by. Burn out, go broke or end up alone and it's over.",
      start: "type START (or press ENTER) to graduate 🎓"
    },

    init: function () {
      return {
        day: 0,
        employed: true, level: 1, skill: 25, rep: 10, salary: 30,
        company: makeCompany(pickOne(COMPANY_NAMES)),
        founder: false, equity: 0, co: null, idea: null,
        money: 6, invest: 0, house: null,
        energy: 75, morale: 70,
        friendsM: 10, friendsW: 10, love: null, kids: 0, noFriendsTurns: 0, rallyPending: false,
        marketBump: 0, workFriends: 0, culls: {},
        recessionDay: (7 + Math.floor(rnd() * 9)) * 365, boostUntil: 0,
        project: null, pending: [], cool: {},
        offer: null, fraudFlag: false, exited: false, exitValue: 0, stretchUntil: 0, debtWeeks: 0, forcedEnd: null,
        ev: null, log: []
      };
    },

    status: function (s) {
      var job = (s.founder && s.co) ? "🦄 founder · " + s.co.stage + " · 🧪" + Math.round(s.co.product) + "% · rev $" + Math.round(s.co.revenue) + "k · 🏦co " + money$(Math.round(s.co.cash)) + " · 👤" + s.co.employees + (s.co.equityStaff ? "(" + s.co.equityStaff + " eq)" : "") + " · you own " + Math.round(s.co.ownership * 100) + "% (stake " + money$(s.equity) + ")"
        : (s.employed ? LEVELS[s.level].name + " " + coTag(s) : "unemployed 😳");
      var lv = s.love ? " 💕 " + s.love.stage + " " + s.love.name + " (strength " + s.love.close + ")" + (s.kids ? " 👶" + s.kids : "") : " 💕 single";
      var pj = s.project ? " · 🛠️ " + Math.min(100, Math.round(100 * s.project.weeksDone / s.project.weeksNeeded)) + "%" + (s.project.bugs ? " 🐛" + s.project.bugs : "") : "";
      return "📅 " + dateLabel(s) + " · age " + age(s) + " · " + job + pj + "\n" +
        "💰" + money$(s.money) + " 📊" + money$(s.invest) + (s.house ? " 🏠" + money$(homeEquity(s)) : "") + " 🔋" + s.energy + " 😀" + s.morale + " 🧠" + s.skill + " ⭐" + s.rep + "\n" +
        "👥" + friends(s) + " (♂" + s.friendsM + " ♀" + s.friendsW + ") " + supportTag(s) + lv;
    },

    start: "hub",

    scenes: {
      hub: {
        text: function (s) { return drainLog(s).concat([[null, "What do you do? ⏳"]]); },
        choices: hubChoices
      },

      // a fired event renders from s.ev (after any pending action reactions)
      event: {
        text: function (s) { return drainLog(s).concat((s.ev && s.ev.text) ? [[STR, s.ev.title + "\n"]].concat(s.ev.text) : [[null, "..."]]); },
        choices: function (s) { return (s.ev && s.ev.choices) ? s.ev.choices : [{ label: "Continue.", match: ["ok", "1"], effect: function () {}, goto: "hub" }]; }
      },

      // ---- retirement: three distinct marquee ends + the ordinary graded one ----
      end_billionaire: { end: true, text: function (s) {
        return [["tok-celebrate", "🤑 BILLIONAIRE\n\n"],
          [null, "You scaled a startup into the stratosphere, cashed out at the top, and your personal net worth crossed ten figures. At " + age(s) + " you have " + money$(netWorth(s)) + " to your name — private-jet money, your name on a building, the works.\n\n"],
          [null, "A vanishingly rare outcome. Nobody who just clocks into a job ever sees a personal balance like this. 🛩️\n\n"], statLine(s)]; } },
      end_unicorn: { end: true, text: function (s) {
        return [["tok-celebrate", "🦄 THE COMPANY MADE IT\n\n"],
          [null, "You bet a chunk of your life on a startup — and it actually worked. A billion-dollar exit, a place in the 'remember when they were tiny' stories, and at " + age(s) + " you never have to work again.\n\n"],
          [null, "You didn't just get rich. You built something that mattered. 🍾\n\n"],
          [INFO, "(A rare few don't stop at the IPO — they reinvest and keep scaling until they're billionaires in their own right.) 🤑\n\n"], statLine(s)]; } },
      end_vp: { end: true, text: function (s) {
        return [["tok-celebrate", "👑 RETIRED AS " + (s.level >= 7 ? "A VP" : "AN EXEC") + "\n\n"],
          [null, "You climbed the whole ladder to " + LEVELS[s.level].name.replace(/ 👑/, "") + " — a title people cold-email about, and (quietly) wealthy with it. You step down at " + age(s) + " on your own terms.\n\n"], statLine(s)]; } },
      end_stealth: { end: true, text: function (s) {
        return [["tok-celebrate", "🤫 STEALTH WEALTH\n\n"],
          [null, "No corner office, no fancy title — you stayed a top engineer (" + LEVELS[s.level].name.replace(/ [🐣]/g, "") + ") and quietly got rich on salary and index funds. You retire at " + age(s) + " on 💰" + money$(netWorth(s)) + ", and nobody at the barbecue has the faintest idea.\n\n"],
          [null, "The best-kept secret in the room. 😎\n\n"], statLine(s)]; } },
      end_retire: { end: true, text: retireOrdinaryText },

      // ---- fails ----
      end_burnout: { end: true, text: function (s) {
        return [["tok-num", "🔥 TOTAL BURNOUT\n\n"], [null, "At " + age(s) + " you open the laptop and simply can't. You log off for good and leave tech.\n\n"], [INFO, "You were running on fumes for years. 🪫"]]; } },
      end_isolation: { end: true, text: function (s) {
        return [["tok-num", "🕳️ ALONE\n\n"], [null, "Somewhere in the grind the people fell away. At " + age(s) + ", the quiet finally wins and you give up on it all.\n\n"], [INFO, "The work was never going to hug you back. 💔"]]; } },
      end_broke: { end: true, text: function (s) {
        return [["tok-num", "💸 BANKRUPT\n\n"], [null, "Eighteen months underwater and the debt won. " + (s.house ? "The bank took the house. " : "") + "Evicted at " + age(s) + ", moving back in with family.\n\n"], [INFO, "The " + (s.house ? "mortgage" : "rent") + ", as ever, was undefeated. 🧾"]]; } },
      end_fade: { end: true, text: function (s) {
        return [["tok-num", "🫥 FADED AWAY\n\n"], [null, "No calls, no plans, no one who'd notice if you didn't show. With no friends left, the days blurred into each other until, at " + age(s) + ", you simply faded out of your own life.\n\n"], [INFO, "Nobody makes it alone. You needed people. 👥"]]; } },

      // ---- mortality (from 50 on) ----
      end_death: { end: true, text: function (s) {
        var partner = partnerLabel(s);
        return [["tok-num", "🪦 GONE TOO SOON\n\n"],
          [null, "It comes without warning at " + age(s) + " — you never made it to the finish line. But the room at the service is full: " + (partner ? partner + " and " : "") + socialLabel(s) + ".\n\n"],
          [INFO, "You didn't retire rich. You were rich the whole time. ❤️"], statLine(s)]; } },
      end_death_hollow: { end: true, text: function (s) {
        var what = (s.founder || s.exited) ? "the company" : "the next rung and the next number";
        return [["tok-num", "⚰️ RICH AND ALONE\n\n"],
          [null, "At " + age(s) + " it just stops — mid-sprint, chasing " + what + ". You'd built " + money$(netWorth(s)) + " and a career people admired.\n\n"],
          [null, "The office sends a big wreath. Almost no one else comes. There was always going to be time for people — later. There wasn't.\n\n"],
          [INFO, "You won the game you were playing. It was the wrong game. 🥀"], statLine(s)]; } },

      // ---- comedic specials ----
      end_agi: { end: true, text: function (s) {
        return [["tok-num", "🤖 CLASSIFIED\n\n"], [null, "The model you shipped got... capable. Three days later, men in unmarked cars. The official story is you 'moved abroad'. At " + age(s) + ".\n\n"], [INFO, "You should not have taught it to negotiate. 🛸"]]; } },
      end_fraud: { end: true, text: function (s) {
        return [["tok-num", "⚖️ FEDERAL POCKET\n\n"], [null, "Turns out auditors do check. The fabricated metrics unravel and at " + age(s) + " you trade an office for a cell. Nice view of a wall.\n\n"], [INFO, "You defrauded investors. They found out. 🚔"]]; } },
      end_greed: { end: true, text: function (s) {
        var v = s.co ? s.co.valuation : GREED_CAP;
        return [["tok-num", "🔫 TOO GREEDY\n\n"], [null, "Your company blew past TEN billion dollars (~" + money$(v) + ") and you STILL wouldn't cash out. Somebody upstairs decided you'd taken more than your share. At " + age(s) + ": a black car, a quiet street, no forwarding address.\n\n"], [INFO, "You could have retired a billionaire many times over. You wanted more. 💰⚰️"]]; } }
    }
  });
})();
