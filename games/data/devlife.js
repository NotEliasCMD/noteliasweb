/* =============================================================================
 * devlife.js — "DEV LIFE": a data-scientist life simulator for the TextGame engine.
 * -----------------------------------------------------------------------------
 * You graduate at 22 and live a career one year at a time. Every turn you pick a
 * SINGLE action; then the year settles — bills, decay, the economy, and a random
 * event. Keep money 💰, health ❤️, energy 🔋 and morale 😀 alive. It is meant to
 * be hard: most runs end badly (broke, burnt out, hospitalised, or you quit).
 *
 * Win conditions:
 *   👔 end_vp      — reach VP of Data Science (level 7)
 *   🦄 end_unicorn — found a startup and take it public at a $1B+ valuation
 *   🏝️ end_stealth — retire at 60 with stealth wealth (net worth ≥ $2.2m)
 *   plus a spread of ordinary "you were an average data scientist" retirements.
 *
 * Built on the generic engine (games/text-game.js): the hub is one scene whose
 * `choices` is a function of state (context-dependent menu); each action's effect
 * advances a year and its goto routes to an ending, an event scene, or back to
 * the hub. All the simulation lives here as data — the engine is untouched.
 * ========================================================================== */
(function () {
  "use strict";
  if (!window.TextGame) return;

  // ---- career ladder --------------------------------------------------------
  var LEVELS = [
    null,
    { name: "Junior DS 🐣", sal: 68 },
    { name: "Data Scientist", sal: 96 },
    { name: "Senior DS", sal: 138 },
    { name: "Staff DS", sal: 185 },
    { name: "Principal DS", sal: 245 },
    { name: "Director of DS", sal: 330 },
    { name: "VP of Data Science 👑", sal: 460 }
  ];

  // ---- helpers --------------------------------------------------------------
  function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
  function rnd() { return Math.random(); }
  function chance(p) { return Math.random() < p; }

  function money$(k) {
    var a = Math.abs(k);
    return (a >= 1000 ? (k / 1000).toFixed(1) + "m" : Math.round(k) + "k");
  }
  function foll(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : "" + n; }
  function valu$(m) { return m >= 1000 ? "$" + (m / 1000).toFixed(2) + "B" : "$" + Math.round(m) + "M"; }

  // apply capped stat deltas (money/invest/followers/valu are uncapped)
  function give(s, d) {
    if (d.health != null) s.health = clamp(s.health + d.health);
    if (d.energy != null) s.energy = clamp(s.energy + d.energy);
    if (d.happy != null) s.happy = clamp(s.happy + d.happy);
    if (d.skill != null) s.skill = clamp(s.skill + d.skill);
    if (d.rep != null) s.rep = clamp(s.rep + d.rep);
    if (d.friends != null) s.friends = clamp(s.friends + d.friends);
    if (d.rel != null) s.rel = clamp(s.rel + d.rel);
    if (d.money != null) s.money += d.money;
    if (d.invest != null) s.invest += d.invest;
    if (d.followers != null) s.followers = Math.max(0, Math.round(s.followers + d.followers));
    if (d.idea != null) s.idea = Math.max(0, Math.round(s.idea + d.idea));
  }

  function log(s, cls, msg) { (s.log = s.log || []).push([cls, msg]); }
  var GOOD = "tok-celebrate", WARN = "tok-num", NOTE = "tok-out", INFO = "tok-comment";

  // ---- yearly settlement ----------------------------------------------------
  // Called after every action: income & bills, drift, promotions, then one
  // random event (which may route to a decision scene or fold a startup).
  function endYear(s) {
    s.age++;
    s.recession = chance(0.25);

    // income vs. cost of living (founders live lean on ramen; employees get
    // lifestyle creep with seniority; the unemployed cut back a bit)
    var take = s.founder ? 0 : (s.employed ? Math.round(s.salary * 0.70) : 0);
    var living = (s.founder ? 22 : (s.employed ? 28 + s.level * 6 : 24)) + (s.relStatus !== "single" ? 8 : 0);
    s.money += take - living;
    s.invest = Math.round(s.invest * 1.04);   // baseline compounding

    // the grind of just being alive — you cannot maintain everything at once
    give(s, { health: -5, energy: -6, happy: -4, skill: -2, rep: -1, friends: -4 });
    if (s.relStatus !== "single") s.rel = clamp(s.rel - 4);

    // debt: a shallow dip is survivable, but a deep hole (< -$15k) for 3 years
    // running bankrupts you.
    if (s.money < -15) {
      s.debtYears = (s.debtYears || 0) + 1;
      give(s, { happy: -8, health: -3 });
      log(s, WARN, "🧾 Deep in the red (" + money$(s.money) + "). " + (3 - s.debtYears) + " year(s) from bankruptcy.");
    } else { if (s.money < 0) give(s, { happy: -3 }); s.debtYears = 0; }

    promote(s);
    rollEvent(s);
    s.searching = false;   // job-hunt bonus only applies the year you do it
  }

  function promote(s) {
    if (!s.employed || s.founder || s.level >= 7) return;
    var needSkill = 10 + s.level * 6;
    var needRep = 5 + s.level * 4;
    if (s.skill >= needSkill && s.rep >= needRep && chance(0.7)) {
      s.level++;
      s.salary = LEVELS[s.level].sal + Math.round(rnd() * 20);
      give(s, { happy: 14, rep: -4 });   // bigger pond → rep dips a touch
      log(s, GOOD, "📈 Promoted to " + LEVELS[s.level].name + "! Salary now $" + s.salary + "k.");
    }
  }

  function makeOffer(s) {
    var lvl = Math.max(s.level, Math.min(6, 1 + Math.floor(s.skill / 18)));
    var co = ["a hot startup 🚀", "Google 🔎", "a unicorn 🦄", "a bank 🏦", "a scale-up 📊"][Math.floor(rnd() * 5)];
    s.offer = { level: lvl, company: co, salary: Math.round(LEVELS[lvl].sal * (1 + rnd() * 0.35)) };
  }

  function rollEvent(s) {
    // 1) layoff — ends employment (with a severance cushion), routes to aftermath
    if (s.employed && !s.founder && chance(s.recession ? 0.16 : 0.07)) {
      s.employed = false; s.route = "laidoff";
      var sev = Math.round(s.salary * 0.5); s.money += sev;
      log(s, WARN, "🪓 " + (s.recession ? "Recession hits. " : "") + "Layoffs — you're out, with $" + sev + "k severance.");
      return;
    }
    // 2) founder life: swings + running out of runway
    if (s.founder) {
      var r = rnd();
      if (r < 0.13) { s.valu *= 0.62; log(s, WARN, "😬 A key engineer quit; valuation slid to " + valu$(s.valu) + "."); }
      else if (r < 0.26) { s.valu *= 1.4; log(s, GOOD, "🚀 Traction! Valuation up to " + valu$(s.valu) + "."); }
      if (s.money < -18) {
        log(s, WARN, "🪦 Out of runway — the startup folds. Back to job-hunting.");
        s.founder = false; s.valu = 0; s.idea = 0; give(s, { happy: -26, health: -10 });
      }
    }
    // 3) markets move your investments
    if (chance(s.recession ? 0.16 : 0.07)) {
      var loss = Math.round(s.invest * (0.25 + rnd() * 0.25));
      if (loss > 0) { s.invest -= loss; log(s, WARN, "📉 Market crash — investments down $" + loss + "k."); }
    } else if (chance(0.14)) {
      var g = Math.round(s.invest * 0.16);
      if (g > 0) { s.invest += g; log(s, GOOD, "📈 Bull run — investments up $" + g + "k."); }
    }
    // 4) health scare (likelier when run-down; steep dive is your own fault)
    if (chance(s.health < 35 ? 0.22 : 0.06)) {
      give(s, { health: -14 }); s.money -= 14;
      log(s, WARN, "🏥 Health scare — $14k hospital bill, health -14.");
    }
    // 5) a job offer (you were hunting, or a recruiter slid in)
    var headhunted = (s.followers >= 3000 || s.rep >= 55) && chance(0.22);
    if (s.employed && !s.founder && (s.searching || headhunted) && s.skill >= 25) {
      makeOffer(s); s.route = "offer";
    } else if (!s.employed && !s.founder) {
      if (s.searching && chance(Math.min(0.85, 0.35 + s.skill / 150 + s.rep / 200))) { makeOffer(s); s.route = "offer"; }
      else log(s, INFO, "🔎 No offers landed. Rent's still due.");
    }
    // 6) social media can pop
    if (s.followers >= 500 && chance(0.18)) {
      s.followers = Math.round(s.followers * (1.5 + rnd()));
      var spon = Math.round(s.followers / 1000 * 3);
      s.money += spon; give(s, { happy: 8 });
      log(s, GOOD, "🔥 A post went viral! Now " + foll(s.followers) + " followers, +$" + spon + "k in sponsorships.");
    }
    // 7) relationships
    if (s.relStatus === "dating" && s.rel >= 72 && chance(0.5)) {
      s.relStatus = "partner"; give(s, { happy: 16 }); log(s, GOOD, "💞 You move in with your partner.");
    } else if (s.relStatus === "partner" && s.rel >= 88 && !s.married && chance(0.4)) {
      s.married = true; give(s, { happy: 22 }); s.money -= 25; log(s, GOOD, "💍 You got married! (a $25k wedding, worth it)");
    } else if (s.relStatus !== "single" && s.rel < 28 && chance(0.6)) {
      log(s, WARN, "💔 Your relationship ended."); s.relStatus = "single"; s.rel = 0; s.married = false; give(s, { happy: -20 });
    }
    // 8) loneliness
    if (s.friends < 10 && chance(0.5)) { give(s, { happy: -9 }); log(s, INFO, "🕳️ You feel pretty isolated these days."); }
  }

  // ---- endings --------------------------------------------------------------
  function checkEnd(s) {
    if (s.health <= 0) return "end_health";
    if (s.energy <= 0) return "end_burnout";
    if (s.happy <= 0) return "end_quit";
    if ((s.debtYears || 0) >= 3) return "end_broke";
    if (s.level >= 7) return "end_vp";
    if (s.age >= 60) {
      var nw = s.money + s.invest;
      if (nw >= 2200 && s.health > 0) return "end_stealth";
      if (nw >= 850) return "end_retire_ok";
      if (s.married || s.relStatus === "partner" || s.friends >= 60) return "end_richlife";
      if (s.happy >= 55) return "end_content";
      return "end_grind";
    }
    return null;
  }

  // where to go after an action resolves
  function nextScene(s) {
    var end = checkEnd(s);
    if (end) return end;
    if (s.route) { var r = s.route; s.route = null; return r; }
    return "hub";
  }

  // ---- the action menu (context-dependent) ----------------------------------
  // Each action applies its immediate effect, then endYear() settles the year.
  function act(deltas, extra) {
    return function (s) { give(s, deltas); if (extra) extra(s); endYear(s); };
  }

  function hubChoices(s) {
    var c = [];
    if (s.founder) {
      c.push({ label: "🚀 Grind on the startup — build, ship, repeat.", match: ["grind", "build", "startup"],
        effect: act({ energy: -10, happy: -1 }, function (st) {
          st.valu *= 1.25 + st.skill / 240;
          var rev = Math.round(st.valu * 0.05); if (rev > 0) { st.money += rev; }   // revenue scales with size
        }), goto: nextScene });
      c.push({ label: "📈 Raise a funding round.", match: ["raise", "round", "fund"],
        effect: act({}, function (st) {
          if (chance(0.75)) { var m = 2.0 + rnd() * 2.2; st.valu *= m; st.money += 110; give(st, { happy: 6 }); log(st, GOOD, "🤝 Round closed! Valuation " + valu$(st.valu) + ", +$110k in the bank."); }
          else { st.valu *= 0.72; give(st, { happy: -12 }); log(st, WARN, "🧊 Down round — investors passed. Valuation " + valu$(st.valu) + "."); }
        }), goto: nextScene });
      if (s.valu >= 1000) c.push({ label: "🔔 Ring the bell — take the company PUBLIC! 🎉", match: ["ipo", "public", "bell", "list"],
        effect: function () {}, goto: "end_unicorn" });
    } else if (s.employed) {
      c.push({ label: "💼 Grind at work — chase the promotion.", match: ["grind", "work"],
        effect: act({ skill: 9, rep: 9, energy: -7, happy: -3 }), goto: nextScene });
      c.push({ label: "🔎 Hunt for a better job.", match: ["hunt", "job", "interview"],
        effect: act({ energy: -6 }, function (st) { st.searching = true; }), goto: nextScene });
    } else {
      c.push({ label: "🔎 Job-hunt hard — you NEED an income.", match: ["hunt", "job", "interview"],
        effect: act({ energy: -6, happy: -4 }, function (st) { st.searching = true; }), goto: nextScene });
    }

    // universal survival / life actions
    c.push({ label: "🍜 Stock the fridge with real food.", match: ["food", "eat", "fridge", "groceries"],
      effect: act({ money: -5, health: 12, energy: 8 }), goto: nextScene });
    c.push({ label: "🛋️ Rest and recharge.", match: ["rest", "recharge", "sleep"],
      effect: act({ energy: 18, health: 6, happy: 8 }), goto: nextScene });
    c.push({ label: "🧑‍🤝‍🧑 See your friends.", match: ["friends", "social", "hang"],
      effect: act({ money: -4, friends: 14, happy: 12, energy: -5 }), goto: nextScene });
    c.push({ label: "📚 Upskill — a course or a side project.", match: ["upskill", "learn", "study", "course"],
      effect: act({ money: -3, skill: 12, energy: -8, happy: -2 }), goto: nextScene });
    c.push({ label: "📱 Post content — build your DS brand.", match: ["post", "content", "brand", "tweet"],
      effect: act({ energy: -6, happy: -2 }, function (st) {
        st.followers = Math.round(st.followers * 1.3) + 40 + Math.floor(rnd() * 60);
      }), goto: nextScene });

    if (s.relStatus === "single") {
      if (s.friends >= 35) c.push({ label: "💕 Ask someone out.", match: ["date", "ask", "romance"],
        effect: act({ happy: 12, energy: -4 }, function (st) { st.relStatus = "dating"; st.rel = 42; log(st, GOOD, "💕 You started seeing someone."); }), goto: nextScene });
    } else {
      c.push({ label: "💗 Nurture your relationship.", match: ["relationship", "partner", "nurture", "love"],
        effect: act({ money: -5, rel: 16, happy: 12, energy: -4 }), goto: nextScene });
    }

    if (s.money > 20) c.push({ label: "💸 Invest your savings.", match: ["invest", "stocks", "market"],
      effect: act({}, function (st) { var amt = Math.round((st.money - 12) * 0.7); st.money -= amt; st.invest += amt; log(st, NOTE, "💸 Moved $" + amt + "k into investments."); }), goto: nextScene });

    if (s.money >= 12) c.push({ label: "🌴 Take a proper holiday.", match: ["holiday", "vacation", "travel"],
      effect: act({ money: -12, energy: 22, health: 12, happy: 20 }), goto: nextScene });

    // founder on-ramp
    if (!s.founder && s.skill >= 35) c.push({ label: "🧪 Moonlight on a startup idea.", match: ["moonlight", "idea", "side"],
      effect: act({ energy: -9, happy: -2, idea: 18 }), goto: nextScene });
    if (!s.founder && (s.idea || 0) >= 26 && s.money >= 22) c.push({ label: "🏢 Quit and go ALL-IN as a founder. 🎲", match: ["found", "all-in", "quit", "startup"],
      effect: act({ happy: 15, energy: -8 }, function (st) { st.founder = true; st.employed = false; st.valu = 14 + st.idea / 5; log(st, GOOD, "🦄 You founded a company! Seed valuation " + valu$(st.valu) + "."); }), goto: nextScene });

    return c;
  }

  // ---- register -------------------------------------------------------------
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
        "     🎓  ->  💼  ->  🦄 / 🏝️ / 💀"
      ],
      tagline: "One data scientist. One career. Survive it. 🧟",
      blurb: "Juggle money 💰, health ❤️, energy 🔋 and morale 😀. Most runs end badly.",
      start: "type START (or press ENTER) to graduate 🎓"
    },

    init: function () {
      return {
        age: 22, money: 4, invest: 0,
        health: 80, energy: 80, happy: 70, skill: 25, rep: 10, friends: 30,
        relStatus: "single", rel: 0, married: false,
        followers: 0, idea: 0,
        employed: true, founder: false, level: 1, salary: 68, valu: 0,
        searching: false, debtYears: 0, recession: false, log: []
      };
    },

    status: function (s) {
      var rel = s.relStatus === "single" ? "single"
        : (s.married ? "married 💍" : s.relStatus) + " " + s.rel;
      var job = s.founder ? "🦄 founder " + valu$(s.valu)
        : (s.employed ? LEVELS[s.level].name : "unemployed 😳");
      return "👤" + s.age + " · " + job + " · 💰$" + money$(s.money) + " · 📊$" + money$(s.invest) + "\n" +
        "❤️" + s.health + " 🔋" + s.energy + " 😀" + s.happy + " 🧠" + s.skill + " ⭐" + s.rep +
        " 📣" + foll(s.followers) + " 👥" + s.friends + " 💕" + rel;
    },

    start: "hub",

    scenes: {
      hub: {
        text: function (s) {
          var out = [];
          if (s.log && s.log.length) {
            s.log.forEach(function (m) { out.push([m[0], m[1] + "\n"]); });
            out.push([null, "\n"]);
            s.log = [];
          }
          out.push([null, "Year " + (s.age - 21) + " — you're " + s.age + ". What do you do? ⏳"]);
          return out;
        },
        choices: hubChoices
      },

      // a job offer arrived
      offer: {
        text: function (s) {
          var o = s.offer;
          return [
            ["tok-str", "📨 An offer from " + o.company + ":\n"],
            [null, LEVELS[o.level].name + " · $" + o.salary + "k/yr.\n"]
          ];
        },
        choices: function (s) {
          var o = s.offer;
          return [
            { label: "✅ Take it.", match: ["take", "accept", "yes"],
              effect: function (st) { st.employed = true; st.level = o.level; st.salary = o.salary; give(st, { happy: 10, rep: 4 }); log(st, GOOD, "✅ You joined " + o.company + " as " + LEVELS[o.level].name + "."); st.offer = null; }, goto: nextScene },
            { label: "🙅 Turn it down.", match: ["decline", "no", "pass", "reject"],
              effect: function (st) { st.offer = null; }, goto: nextScene }
          ];
        }
      },

      // aftermath of a layoff
      laidoff: {
        text: [
          ["tok-num", "📦 You pack your desk into a cardboard box.\n"],
          [null, "No salary now — savings drain until you land something. What's the move?"]
        ],
        choices: function (s) {
          var c = [
            { label: "🔎 Job-hunt immediately.", match: ["hunt", "job"],
              effect: act({ energy: -6, happy: -4 }, function (st) { st.searching = true; }), goto: nextScene },
            { label: "🧘 Take a breather first.", match: ["rest", "breather", "break"],
              effect: act({ energy: 14, health: 8, happy: 6 }), goto: nextScene }
          ];
          if ((s.idea || 0) >= 20 && s.money >= 20) c.push({ label: "🏢 Screw it — go found a startup. 🎲", match: ["found", "startup", "all-in"],
            effect: act({ happy: 12 }, function (st) { st.founder = true; st.valu = 14 + st.idea / 5; log(st, GOOD, "🦄 You founded a company! Seed valuation " + valu$(st.valu) + "."); }), goto: nextScene });
          return c;
        }
      },

      // ---- WIN endings ----
      end_vp: { end: true, text: function (s) {
        return [["tok-celebrate", "👑 VP OF DATA SCIENCE 👑\n\n"],
          [null, "At " + s.age + ", you run the whole org. Comp, equity, and a title people cold-email about.\n\n"],
          [INFO, "net worth ~$" + money$(s.money + s.invest) + " · morale " + s.happy + " · a corner office and a calendar full of 1:1s."]]; } },

      end_unicorn: { end: true, text: function (s) {
        return [["tok-celebrate", "🦄🔔 IPO DAY — THE BELL RINGS! 🔔🦄\n\n"],
          [null, "Your AI company lists at " + valu$(s.valu) + ". You're a founder-CEO with generational wealth.\n\n"],
          [INFO, "You beat the odds almost no one beats. 🍾"]]; } },

      end_stealth: { end: true, text: function (s) {
        return [["tok-celebrate", "🏝️ RETIRED — STEALTH WEALTH 🤫\n\n"],
          [null, "You quietly hit $" + money$(s.money + s.invest) + " net worth and walked away at 60. No yachts, no fuss — just freedom.\n\n"],
          [INFO, "Old colleagues have no idea. That's the point. 😎"]]; } },

      // ---- ordinary retirements ----
      end_retire_ok: { end: true, text: function (s) {
        return [["tok-out", "🏡 A COMFORTABLE RETIREMENT\n\n"],
          [null, "You retire at 60 with $" + money$(s.money + s.invest) + " and a solid pension. Not rich, not scraping — just fine.\n\n"],
          [INFO, "A good, unremarkable career in data science. 📊"]]; } },

      end_richlife: { end: true, text: function (s) {
        return [["tok-out", "❤️ RICH IN THE THINGS THAT COUNT\n\n"],
          [null, "The money was ordinary, but you retire surrounded by people who love you" + (s.married ? " and a partner of many years" : "") + ".\n\n"],
          [INFO, "friends " + s.friends + " · morale " + s.happy + " · you'd do it again."]]; } },

      end_content: { end: true, text: function () {
        return [["tok-out", "🙂 AN AVERAGE, CONTENT LIFE\n\n"],
          [null, "You were never VP and never rich. You were a working data scientist who was mostly happy. That's more than most manage.\n\n"],
          [INFO, "The credits roll on a perfectly ordinary career. 🎬"]]; } },

      end_grind: { end: true, text: function () {
        return [["tok-out", "😐 THE LONG GRIND\n\n"],
          [null, "You reach 60 having spent it heads-down in dashboards and stand-ups. The pension's thin and the spark's mostly gone, but you made it to the end.\n\n"],
          [INFO, "Just another data scientist who clocked out for the last time. 🫡"]]; } },

      // ---- FAIL endings ----
      end_health: { end: true, text: function (s) {
        return [["tok-num", "🏥 YOUR HEALTH GAVE OUT\n\n"],
          [null, "At " + s.age + ", years of skipped meals and no sleep caught up with you. The career stops here.\n\n"],
          [INFO, "No title is worth this. 💔"]]; } },

      end_burnout: { end: true, text: function (s) {
        return [["tok-num", "🔥 TOTAL BURNOUT\n\n"],
          [null, "At " + s.age + ", you open your laptop and simply... can't. You log off for good and leave tech entirely.\n\n"],
          [INFO, "The rest was running on fumes for years. 🪫"]]; } },

      end_quit: { end: true, text: function (s) {
        return [["tok-num", "🚪 YOU WALKED AWAY\n\n"],
          [null, "The joy drained out completely. At " + s.age + " you quit data science to go do literally anything else.\n\n"],
          [INFO, "Maybe you'll open a bakery. 🥐"]]; } },

      end_broke: { end: true, text: function (s) {
        return [["tok-num", "💸 BANKRUPT\n\n"],
          [null, "Three years underwater and the debt won. Evicted at " + s.age + ", moving back in with family.\n\n"],
          [INFO, "The rent, as ever, was undefeated. 🧾"]]; } }
    }
  });
})();
