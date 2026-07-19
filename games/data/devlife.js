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
    { name: "Junior DS 🐣", sal: 68 },
    { name: "Data Scientist", sal: 98 },
    { name: "Senior DS", sal: 140 },
    { name: "Staff DS", sal: 190 },
    { name: "Principal DS", sal: 250 },
    { name: "Director of DS", sal: 340 },
    { name: "VP of Data Science 👑", sal: 470 }
  ];

  /* ---- helpers ------------------------------------------------------------- */
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function rnd() { return Math.random(); }
  function chance(p) { return Math.random() < p; }
  function pickOne(a) { return a[Math.floor(rnd() * a.length)]; }
  function money$(k) { var a = Math.abs(k); return a >= 1000 ? "$" + (k / 1000).toFixed(1) + "m" : "$" + Math.round(k) + "k"; }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var START_YEAR = 2016;
  function age(s) { return 22 + Math.floor(s.day / 365); }
  function dateLabel(s) {
    var y = START_YEAR + Math.floor(s.day / 365);
    var m = Math.min(11, Math.floor((s.day % 365) / 30.42));
    return MONTHS[m] + " " + y;
  }

  // capped 0–100 stats; money/invest/equity are uncapped
  function give(s, d) {
    if (d.energy != null) s.energy = clamp(s.energy + d.energy);
    if (d.morale != null) s.morale = clamp(s.morale + d.morale);
    if (d.skill != null) s.skill = clamp(s.skill + d.skill);
    if (d.rep != null) s.rep = clamp(s.rep + d.rep);
    if (d.money != null) s.money += d.money;
    if (d.invest != null) s.invest += d.invest;
    if (d.equity != null) s.equity += d.equity;
  }
  function friends(s) { return s.friendsM + s.friendsW; }
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
    social: ["🍻 A great night out with the crew — just what you needed.", "🧑‍🤝‍🧑 Long lunches and belly-laughs. Good for the soul.", "🎳 A daft evening with friends. Batteries topped up."],
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
    var weeks = 6 + Math.floor(rnd() * 10);      // 6–15 weeks of effort
    s.project = {
      name: p.name, tech: p.tech, weeksNeeded: weeks, weeksDone: 0,
      bugs: 0, quality: 82, deadlineDay: s.day + (weeks + 4 + Math.floor(rnd() * 8)) * 7
    };
    log(s, NOTE, "🛠️ New project: " + p.name + " (" + p.tech + "), ~" + weeks + " weeks.");
  }
  function focusProject(s, weeks) {
    var eff = weeks * (0.65 + s.skill / 130);    // skill speeds delivery
    s.project.weeksDone += eff;
    give(s, { energy: -6 - weeks, skill: 1 });
  }
  function shipProject(s) {
    var p = s.project; s.project = null;
    var onTime = s.day <= p.deadlineDay;
    var q = p.quality - p.bugs * 9;
    if (q >= 60 && onTime) {
      var bonus = Math.round(s.salary * 0.08);
      give(s, { skill: 5, rep: 9, morale: 8, money: bonus });
      log(s, GOOD, "🚀 Shipped " + p.name + " clean and on time! +rep, $" + bonus + "k bonus.");
      maybePromote(s);
    } else if (q >= 60) {
      give(s, { rep: 2, morale: 3 });
      log(s, NOTE, "🐢 Shipped " + p.name + " — late, but it works. Small win.");
    } else {
      give(s, { rep: -11, morale: -9 });
      log(s, WARN, "🧨 " + p.name + " flopped — too buggy, shelved after launch. Reputation took a real hit.");
    }
  }
  function maybePromote(s) {
    // Normal promotions cap at Principal (level 5 — the top IC rung). Director/VP
    // (6/7) are scarce EXEC seats reached only via the rare "exec_opening" event,
    // so most careers plateau as senior ICs (→ stealth wealth) and VP is rare.
    if (s.founder || !s.employed || s.level >= 5) return;
    var needSkill = 12 + s.level * 9, needRep = 10 + s.level * 8;
    if (s.skill >= needSkill && s.rep >= needRep && chance(Math.max(0.35, 0.6 - s.level * 0.05))) {
      s.level++; s.salary = LEVELS[s.level].sal + Math.round(rnd() * 20);
      give(s, { morale: 12, rep: -3 });
      log(s, GOOD, "📈 Promoted to " + LEVELS[s.level].name + "! Salary now $" + s.salary + "k.");
    }
  }

  /* ---- the passing of time ------------------------------------------------- */
  function accrue(s, weeks) {
    var take = (s.employed && !s.founder) ? s.salary * 0.72 : 0;
    var living = 28 + s.level * 4 + (s.love && s.love.stage !== "dating" ? 10 : 0);
    s.money += (take - living) * (weeks / 52);
    s.invest = Math.round(s.invest * Math.pow(1.05, weeks / 52));
    give(s, { morale: -0.5 * (weeks / 4), energy: 0.4 * (weeks / 4) });  // life goes stale; you recover slowly at rest
    if (chance(0.05 * weeks)) loseFriend(s);         // drift out of touch
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
  function advance(s, weeks, tag) {
    var elapsed = 0, step = 4;
    while (elapsed < weeks) {
      var w = Math.min(step, weeks - elapsed);
      s.day += w * 7; elapsed += w;
      accrue(s, w);
      if (s.pending && s.pending.length) s.pending = s.pending.filter(function (p) { return p.expiresDay >= s.day; });
      if (age(s) >= 65) { s.forcedEnd = retireEnding(s); return; }
      var ev = rollEvent(s, tag);
      if (ev) { s.route = ev; return; }
    }
  }

  /* ---- endings routing ----------------------------------------------------- */
  function checkEnd(s) {
    if (s.forcedEnd) { var f = s.forcedEnd; s.forcedEnd = null; return f; }
    if (s.energy <= 0) return "end_burnout";
    if (s.morale <= 0) return "end_isolation";
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
  function makeOffer(s) {
    var lvl = Math.max(s.employed ? s.level : 1, Math.min(5, 1 + Math.floor(s.skill / 16)));  // external offers top out at IC; exec seats come via exec_opening
    var co = pickOne(["a hot startup 🚀", "Google 🔎", "a unicorn 🦄", "a big bank 🏦", "a scale-up 📊", "a FAANG 🧠"]);
    s.offer = { level: lvl, company: co, salary: Math.round(LEVELS[lvl].sal * (1 + rnd() * 0.35)) };
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
    { id: "recruiter", cat: "work", weight: 2, cool: 26, when: function (s) { return s.employed && !s.founder && s.skill >= 20; },
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
    { id: "reorg", cat: "work", weight: 2, cool: 30, when: function (s) { return s.employed && !s.founder; },
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
                else { give(st, { rep: 20, morale: 15, equity: st.founder ? 400 : 0, money: st.founder ? 0 : 60 }); log(st, GOOD, "🌐 It works and it's SAFE (this time). You're famous."); }
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
              effect: act(1, null, function (st) { st.love = { name: p.name, w: p.w, close: 46, stage: "dating" }; addFriend(st, p.w ? "w" : "m"); give(st, { morale: 14, energy: -3 }); log(st, GOOD, "💕 You and " + p.name + " start seeing each other."); }), goto: nextScene })]);
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
    { id: "love_milestone", cat: "romance", weight: 3, cool: 20, when: function (s) { return s.love && s.love.close >= 70 && s.love.stage !== "married"; },
      build: function (s) {
        var nm = s.love.name, moving = s.love.stage === "dating";
        return ev("💞 A big step with " + nm,
          [line(STR, (moving ? nm + " suggests moving in together." : nm + " leaves a ring catalogue open 'by accident'.") + "\n")],
          [{ label: moving ? "Move in together." : "Propose. 💍", match: ["yes", "propose", "movein", "1"],
              effect: act(1, null, function (st) {
                if (moving) { st.love.stage = "partner"; give(st, { morale: 16 }); log(st, GOOD, "🏡 You and " + nm + " move in together."); }
                else { st.love.stage = "married"; give(st, { morale: 22, money: -25 }); log(st, GOOD, "💍 You married " + nm + "! ($25k wedding, worth it.)"); }
              }), goto: nextScene },
            { label: "Say you're not ready.", match: ["wait", "no", "2"],
              effect: act(0, null, function (st) { st.love.close = clamp(st.love.close - 18); give(st, { morale: -4 }); log(st, INFO, "😬 " + nm + " tried to hide the disappointment."); }), goto: nextScene }]);
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
        var amt = 8 + Math.floor(rnd() * 30);
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
              effect: act(0, null, function (st) { give(st, { rep: 4, morale: 5, equity: st.founder ? -100 : 0 }); log(st, NOTE, "🫡 You told the truth. It cost you, but you sleep fine."); }), goto: nextScene },
            { label: "Fudge the numbers. Nobody checks. 🎲", match: ["fake", "fudge", "cook", "2"],
              effect: act(0, null, function (st) { st.fraudFlag = true; give(st, { money: st.founder ? 0 : 120, equity: st.founder ? 800 : 0, morale: -4 }); log(st, WARN, "🤫 The numbers look great now. You feel a little sick."); }), goto: nextScene }]);
      } },
    { id: "audit", cat: "finance", weight: 2, cool: 20, when: function (s) { return s.fraudFlag; },
      build: function (s) {
        return ev("🕵️ An auditor comes knocking",
          [line(WARN, "Someone's asking pointed questions about those old numbers.\n")],
          [{ label: "Lawyer up and settle quietly.", match: ["settle", "lawyer", "1"],
              effect: act(1, null, function (st) { st.fraudFlag = false; give(st, { money: -80, morale: -8 }); log(st, WARN, "⚖️ A quiet, expensive settlement. It's behind you."); }), goto: nextScene },
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
          [line(STR, "You've got an idea and a co-founder in your DMs. Quit and go all-in?\n")],
          [{ label: "Quit and found it. 🎲", match: ["found", "quit", "1"],
              effect: act(1, null, function (st) { st.founder = true; st.employed = false; st.project = null; st.equity = 40 + st.skill * 2; give(st, { morale: 16, energy: -6 }); log(st, GOOD, "🦄 You founded a company! Equity ~" + money$(st.equity) + "."); }), goto: nextScene },
            { label: "Keep the salary. Stay sane.", match: ["stay", "no", "2"], effect: act(0, null, function (st) { give(st, { morale: -2 }); }), goto: nextScene }]);
      } }
  ];

  function offerScene(s, title) {
    return ev(title,
      [line(STR, s.offer.company + " — " + LEVELS[s.offer.level].name + " · $" + s.offer.salary + "k/yr.\n")],
      [{ label: "✅ Take it.", match: ["take", "accept", "yes", "1"],
          effect: act(2, null, function (st) { st.employed = true; st.founder = false; st.level = st.offer.level; st.salary = st.offer.salary; st.project = null; give(st, { morale: 10, rep: 3 }); log(st, GOOD, "✅ You joined " + st.offer.company + " as " + LEVELS[st.offer.level].name + "."); st.offer = null; }), goto: nextScene },
        { label: "🙅 Pass.", match: ["decline", "pass", "no", "2"],
          effect: act(0, null, function (st) { st.offer = null; }), goto: nextScene }]);
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
    if (tag === "focus" && s.project && chance(0.24)) {   // a bug surfaces mid-build
      s.project.bugs++;
      s.ev = ev("🐛 A bug surfaces",
        [line(WARN, "QA finds a nasty edge case in " + s.project.name + ".\n")],
        [{ label: "Stop and fix it properly (≈1 week).", match: ["fix", "1"],
            effect: act(1, null, function (st) { st.project.bugs--; st.project.weeksNeeded += 1; give(st, { energy: -5 }); log(st, NOTE, "🔧 Fixed. A week gone, but it's clean."); }), goto: nextScene },
          { label: "Ticket it for 'later'. Ship velocity!", match: ["defer", "later", "2"],
            effect: act(0, null, function (st) { st.project.quality -= 6; log(st, WARN, "🩹 Deferred. Quality slips a little."); }), goto: nextScene }]);
      return "event";
    }
    if (tag === "hunt" && !s.founder && chance(0.6)) { makeOffer(s); s.ev = offerScene(s, "📨 An offer came in"); return "event"; }
    if (!chance(0.12)) return null;
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
  function netWorth(s) { return Math.round(s.money + s.invest); }
  function retireEnding(s) {
    if (s.exited || (s.founder && s.equity >= 1500)) return "end_unicorn";
    if (s.level >= 6) return "end_vp";
    if (netWorth(s) >= 2500) return "end_stealth";
    return "end_retire";
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
    else if (nw >= 1200) head = "🏡 A COMFORTABLE RETIREMENT";
    else if (nw < 250 && friends(s) < 4 && !partner) head = "🥲 A LONELY, THIN RETIREMENT";
    else if (partner || friends(s) >= 12) head = "🙂 A GOOD, ORDINARY RETIREMENT";
    else head = "😐 A QUIET, MODEST RETIREMENT";
    var wealth = nw >= 1200 ? "comfortably off" : nw >= 300 ? "financially fine" : "on a thin pension";
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

    if (s.founder) {
      c.push({ label: "🚀 Build the product.", match: ["build", "grind", "work"],
        effect: act(3, null, function (st) { st.equity = Math.round(st.equity * (1.12 + st.skill / 400) + 5); give(st, { energy: -10, skill: 2 }); react(st, RX.build); }), goto: nextScene });
      c.push({ label: "📈 Raise a round.", match: ["raise", "round", "fund"],
        effect: act(2, null, function (st) {
          if (chance(0.7)) { st.equity = Math.round(st.equity * (1.8 + rnd() * 1.6)); st.money += 60; give(st, { morale: 6 }); log(st, GOOD, "🤝 Round closed. Equity ~" + money$(st.equity) + ", +$60k salary."); }
          else { st.equity = Math.round(st.equity * 0.7); give(st, { morale: -12 }); log(st, WARN, "🧊 Down round. Equity ~" + money$(st.equity) + "."); }
        }), goto: nextScene });
      if (s.equity >= 1500) c.push({ label: "🔔 Exit — sell / IPO the company! 🎉", match: ["exit", "ipo", "sell", "cash"],
        effect: act(1, null, function (st) { var cash = Math.round(st.equity * 0.6); st.money += cash; st.exited = true; log(st, GOOD, "🏦 You exit for " + money$(cash) + "! Now what?"); st.founder = false; st.equity = 0; st.employed = false; }), goto: nextScene });
    } else if (s.employed) {
      if (s.project) {
        c.push({ label: "🎯 Focus on " + s.project.name + ".", match: ["focus", "work", "grind"],
          effect: act(6, "focus", function (st) { var nm = st.project.name; focusProject(st, 6); react(st, RX.focus, { proj: nm }); }), goto: nextScene });
        if (s.project.weeksDone >= s.project.weeksNeeded) c.push({ label: "🚀 Ship " + s.project.name + "!", match: ["ship", "release", "launch"],
          effect: act(1, null, function (st) { shipProject(st); }), goto: nextScene });
      } else {
        c.push({ label: "🎯 Take on a new project.", match: ["project", "new", "pick"],
          effect: act(1, null, function (st) { startProject(st); }), goto: nextScene });
      }
      c.push({ label: "🔎 Quietly look for a better job.", match: ["hunt", "job", "interview"], effect: act(4, "hunt", function (st) { react(st, RX.hunt); }), goto: nextScene });
    } else {
      c.push({ label: "🔎 Job-hunt hard — you need an income.", match: ["hunt", "job", "interview"],
        effect: act(4, "hunt", function (st) { give(st, { morale: -3 }); react(st, RX.hunt); }), goto: nextScene });
    }

    // universal life actions
    c.push({ label: "🛋️ Rest and recharge.", match: ["rest", "recharge", "sleep"], effect: act(2, null, function (st) { give(st, { energy: 22, morale: 6 }); react(st, RX.rest); }), goto: nextScene });
    c.push({ label: "🧑‍🤝‍🧑 See friends / go out.", match: ["friends", "social", "socialise", "out"],
      effect: act(1, null, function (st) { addFriend(st); give(st, { morale: 11, energy: 8, money: -4 }); if (!st.love && chance(0.25)) { var pp = person(); st.love = { name: pp.name, w: pp.w, close: 44, stage: "dating" }; log(st, GOOD, "💕 You met " + pp.name + " — you're seeing each other now."); } else { react(st, RX.social); } }), goto: nextScene });
    c.push({ label: "📚 Upskill — a course / side project.", match: ["upskill", "learn", "study", "course"], effect: act(3, null, function (st) { give(st, { skill: 10, energy: -7, money: -2, morale: -1 }); react(st, RX.upskill); }), goto: nextScene });
    if (s.love) c.push({ label: "💗 Invest in things with " + s.love.name + ".", match: ["love", "relationship", "nurture", "partner"],
      effect: act(1, null, function (st) { var nm = st.love.name; st.love.close = clamp(st.love.close + 16); give(st, { morale: 10, energy: 6, money: -5 }); react(st, RX.love, { name: nm }); }), goto: nextScene });
    else c.push({ label: "💘 Put yourself out there (dating).", match: ["date", "dating", "romance"],
      effect: act(2, null, function (st) { if (chance(0.5)) { var pp = person(); st.love = { name: pp.name, w: pp.w, close: 42, stage: "dating" }; give(st, { morale: 10, energy: 4 }); log(st, GOOD, "💕 You hit it off with " + pp.name + "."); } else { give(st, { morale: -3 }); react(st, RX.date); } }), goto: nextScene });
    if (s.money > 15) c.push({ label: "💸 Invest your savings.", match: ["invest", "stocks", "market"],
      effect: act(1, null, function (st) { var amt = Math.round((st.money - 10) * 0.7); st.money -= amt; st.invest += amt; log(st, NOTE, "💸 Moved $" + amt + "k into investments."); }), goto: nextScene });
    if (s.money >= 12) c.push({ label: "🌴 Take a proper holiday.", match: ["holiday", "vacation", "travel"], effect: act(3, null, function (st) { give(st, { energy: 30, morale: 18, money: -14 }); react(st, RX.holiday); }), goto: nextScene });

    // coast through quiet time (a big jump; events still interrupt)
    c.push({ label: "⏭️ Let time pass — get on with life.", match: ["coast", "continue", "wait", "pass"], effect: act(48, null, function (st) { react(st, RX.coast); }), goto: nextScene });

    // retire when eligible (age, or financially independent → retire early)
    if (age(s) >= 45 || (s.money + s.invest) >= 2500) c.push({ label: "🏁 Call it a career — retire.", match: ["retire", "finish", "end"], effect: function () {}, goto: function (st) { return retireEnding(st); } });

    return c;
  }

  /* ---- register ------------------------------------------------------------ */
  window.TextGame.register({
    id: "devlife",
    defaultForPlay: true,
    fileLabel: "elias@life — devlife.py",

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
        employed: true, level: 1, skill: 25, rep: 10, salary: 68,
        founder: false, equity: 0,
        money: 6, invest: 0,
        energy: 75, morale: 70,
        friendsM: 10, friendsW: 10, love: null,
        project: null, pending: [], cool: {},
        offer: null, fraudFlag: false, exited: false, debtWeeks: 0, forcedEnd: null,
        ev: null, log: []
      };
    },

    status: function (s) {
      var job = s.founder ? "🦄 founder (" + money$(s.equity) + ")" : (s.employed ? LEVELS[s.level].name : "unemployed 😳");
      var lv = s.love ? " 💕 " + s.love.stage + " " + s.love.name + " (" + s.love.close + ")" : " 💕 single";
      var pj = s.project ? " · 🛠️ " + Math.min(100, Math.round(100 * s.project.weeksDone / s.project.weeksNeeded)) + "%" + (s.project.bugs ? " 🐛" + s.project.bugs : "") : "";
      return "📅 " + dateLabel(s) + " · age " + age(s) + " · " + job + pj + "\n" +
        "💰" + money$(s.money) + " 📊" + money$(s.invest) + " 🔋" + s.energy + " 😀" + s.morale + " 🧠" + s.skill + " ⭐" + s.rep + "\n" +
        "👥" + friends(s) + " (♂" + s.friendsM + " ♀" + s.friendsW + ")" + lv;
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
      end_unicorn: { end: true, text: function (s) {
        return [["tok-celebrate", "🦄 THE COMPANY MADE IT\n\n"],
          [null, "You bet a chunk of your life on a startup — and it actually worked. An exit, a place in the 'remember when they were tiny' stories, and at " + age(s) + " you never have to work again.\n\n"],
          [null, "You didn't just get rich. You built something that mattered. 🍾\n\n"], statLine(s)]; } },
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
        return [["tok-num", "💸 BANKRUPT\n\n"], [null, "Eighteen months underwater and the debt won. Evicted at " + age(s) + ", moving back in with family.\n\n"], [INFO, "The rent, as ever, was undefeated. 🧾"]]; } },

      // ---- comedic specials ----
      end_agi: { end: true, text: function (s) {
        return [["tok-num", "🤖 CLASSIFIED\n\n"], [null, "The model you shipped got... capable. Three days later, men in unmarked cars. The official story is you 'moved abroad'. At " + age(s) + ".\n\n"], [INFO, "You should not have taught it to negotiate. 🛸"]]; } },
      end_fraud: { end: true, text: function (s) {
        return [["tok-num", "⚖️ FEDERAL POCKET\n\n"], [null, "Turns out auditors do check. The fabricated metrics unravel and at " + age(s) + " you trade an office for a cell. Nice view of a wall.\n\n"], [INFO, "You defrauded investors. They found out. 🚔"]]; } }
    }
  });
})();
