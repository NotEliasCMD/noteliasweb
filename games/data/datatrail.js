/* =============================================================================
 * datatrail.js — "The Data Trail": an on-brand Oregon-Trail-style text game.
 * -----------------------------------------------------------------------------
 * PURE DATA for the TextGame engine (games/text-game.js). You (a data scientist)
 * must ship a model to production before the quarter ends, managing compute,
 * coffee and morale across five legs of the journey, weathering random events.
 *
 * This file is also the reference TEMPLATE: to add another text game, copy this
 * shape (id / intro / init / status / start / scenes) into a new data module and
 * load it after text-game.js. The engine/UI never changes.
 *
 * Scene contract (see engine header for the full spec):
 *   text    : string | string[] | [cls,text][] | (state) => any of those
 *   choices : [{ match:[..], label, goto, effect? }]  goto: id | (state)=>id
 *   end     : true   → engine shows "play again? (y/n)"
 * ========================================================================== */
(function () {
  "use strict";
  if (!window.TextGame) return;

  var clamp = function (n) { return Math.max(0, Math.min(100, Math.round(n))); };

  // Random events fired between legs. A mix of setbacks and lucky breaks so no
  // two runs feel the same.
  var EVENTS = [
    { t: "A prod service pages you at 2am. You firefight instead of sleeping.",
      f: function (s) { s.morale -= 20; s.coffee -= 14; } },
    { t: "The office coffee machine dies. A dark day for everyone.",
      f: function (s) { s.coffee -= 26; s.morale -= 6; } },
    { t: "A flaky test fails in CI three times, then passes. Nobody knows why.",
      f: function (s) { s.compute -= 16; s.morale -= 12; } },
    { t: "An exec reshares your chart in the all-hands. Team morale soars.",
      f: function (s) { s.morale += 18; } },
    { t: "You snag a pool of cheap spot GPUs. The compute budget breathes.",
      f: function (s) { s.compute += 20; } },
    { t: "Legal finds PII hiding in a feature. You scrub it and re-run everything.",
      f: function (s) { s.compute -= 20; s.progress -= 6; } },
    { t: "A teammate brings pastries and pairs with you all afternoon.",
      f: function (s) { s.morale += 14; s.coffee += 10; } },
    { t: "Scope creep: \"can it also predict churn?\" You politely defer it.",
      f: function (s) { s.morale -= 12; } },
    { t: "A clean dataset arrives, already documented. You don't trust it. It's real.",
      f: function (s) { s.progress += 8; s.morale += 6; } }
  ];

  function rollEvent(s) {
    var e = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    e.f(s);
    s.compute = clamp(s.compute); s.coffee = clamp(s.coffee);
    s.morale = clamp(s.morale); s.progress = clamp(s.progress);
    s.flash = "» " + e.t;
    if (s.compute <= 0) { s.busted = true; s.bust = "compute"; }
    else if (s.coffee <= 0) { s.busted = true; s.bust = "coffee"; }
    else if (s.morale <= 0) { s.busted = true; s.bust = "morale"; }
  }

  // goto helper: fall through to the bust scene the moment a resource is spent.
  function next(id) { return function (s) { return s.busted ? "bust" : id; }; }

  // Print the previous leg's random-event line (once), then clear it.
  function flash(s) {
    if (!s.flash) return [];
    var line = [["tok-str", s.flash + "\n\n"]];
    s.flash = null;
    return line;
  }

  // A choice that spends/earns resources, nudges progress, then rolls an event.
  function step(deltas) {
    return function (s) {
      if (deltas.compute) s.compute = clamp(s.compute + deltas.compute);
      if (deltas.coffee) s.coffee = clamp(s.coffee + deltas.coffee);
      if (deltas.morale) s.morale = clamp(s.morale + deltas.morale);
      if (deltas.progress) s.progress = clamp(s.progress + deltas.progress);
      s.leg = (s.leg || 0) + 1;
      rollEvent(s);
    };
  }

  window.TextGame.register({
    id: "datatrail",
    fileLabel: "elias@analysis — datatrail.py",
    statsName: "THE DATA TRAIL",

    // Friendly labels for the "your record" readout (see text-game.js
    // statsChunks). MUST stay in sync with the `end: true` scenes below.
    endings: [
      { id: "win",  label: "★ Reached production" },
      { id: "bust", label: "✗ Trail ended" }
    ],

    intro: {
      banner: [
        "  .--------------------------------.",
        "  |   T H E  D A T A  T R A I L    |",
        "  '--------------------------------'",
        "",
        "   raw CSV  o--o--o--o-->  PROD",
        "     pack your GPUs & coffee"
      ],
      tagline: "Ship a model to production before the quarter ends.",
      blurb: "Mind your compute, coffee and morale. Let any hit zero and the run is over.",
      start: "type START (or press ENTER) to hit the trail"
    },

    init: function () {
      return { compute: 100, coffee: 100, morale: 100, progress: 0, leg: 0, busted: false };
    },

    // HUD reprinted above every scene.
    status: function (s) {
      return "[ compute " + s.compute + " · coffee " + s.coffee +
             " · morale " + s.morale + " · progress " + s.progress + "% ]";
    },

    start: "eda",

    scenes: {
      /* ---- leg 1: kickoff / EDA ---- */
      eda: {
        text: function (s) {
          return flash(s).concat([
            "LEG 1 — KICKOFF.",
            "You inherit 4GB of half-documented CSVs and a vague ask:",
            "\"make it smarter.\" Where do you start?"
          ]);
        },
        choices: [
          { label: "Dive into a quick-and-dirty notebook.",
            match: ["dive", "notebook", "quick"],
            effect: step({ progress: 16, morale: 4, compute: -14 }), goto: next("features") },
          { label: "Write a proper data contract first.",
            match: ["contract", "proper", "data contract"],
            effect: step({ progress: 10, morale: -8, coffee: -6 }), goto: next("features") },
          { label: "Ask the stakeholder what they actually need.",
            match: ["ask", "stakeholder", "need"],
            effect: step({ progress: 8, morale: 6 }), goto: next("features") }
        ]
      },

      /* ---- leg 2: feature engineering ---- */
      features: {
        text: function (s) {
          return flash(s).concat([
            "LEG 2 — FEATURES.",
            "The data's mapped. Now the part that actually moves the metric.",
            "How do you build features?"
          ]);
        },
        choices: [
          { label: "Hand-craft domain features. Slow but sharp.",
            match: ["hand", "domain", "craft"],
            effect: step({ progress: 18, morale: -14, coffee: -16 }), goto: next("train") },
          { label: "Throw everything at automated feature generation.",
            match: ["auto", "everything", "automated"],
            effect: step({ progress: 14, compute: -30 }), goto: next("train") },
          { label: "Reuse last quarter's feature store.",
            match: ["reuse", "store", "feature store", "last"],
            effect: step({ progress: 9, compute: 6, morale: 3 }), goto: next("train") }
        ]
      },

      /* ---- leg 3: modelling ---- */
      train: {
        text: function (s) {
          return flash(s).concat([
            "LEG 3 — MODELLING.",
            "Time to actually fit something. Pick your weapon:"
          ]);
        },
        choices: [
          { label: "Gradient-boosted trees. Boring, reliable, wins Kaggle.",
            match: ["trees", "boost", "xgboost", "gbm", "gradient"],
            effect: step({ progress: 20, compute: -18 }), goto: next("validate") },
          { label: "A big neural net, because it's cool.",
            match: ["neural", "net", "deep", "cool"],
            effect: step({ progress: 16, compute: -34, morale: -8 }), goto: next("validate") },
          { label: "A humble logistic-regression baseline first.",
            match: ["logistic", "baseline", "simple", "humble"],
            effect: step({ progress: 10, compute: -6, morale: 8 }), goto: next("validate") }
        ]
      },

      /* ---- leg 4: validation ---- */
      validate: {
        text: function (s) {
          return flash(s).concat([
            "LEG 4 — VALIDATION.",
            "The metric is stunning. 0.99 AUC. Suspiciously stunning.",
            "What do you do?"
          ]);
        },
        choices: [
          { label: "Hunt for data leakage before anyone celebrates.",
            match: ["leak", "hunt", "investigate", "leakage"],
            effect: step({ progress: 18, morale: -12, coffee: -14 }), goto: next("deploy") },
          { label: "Ship it — the number is green!",
            match: ["ship", "green", "send it"],
            effect: step({ progress: 6, morale: -18 }), goto: next("deploy") },
          { label: "Run a proper backtest and calibration.",
            match: ["backtest", "calibrate", "calibration", "proper"],
            effect: step({ progress: 16, compute: -16 }), goto: next("deploy") }
        ]
      },

      /* ---- leg 5: deployment ---- */
      deploy: {
        text: function (s) {
          return flash(s).concat([
            "LEG 5 — DEPLOY.",
            "Production is in sight. One last call to make."
          ]);
        },
        choices: [
          { label: "Canary rollout behind a feature flag.",
            match: ["canary", "flag", "rollout"],
            effect: step({ progress: 20, compute: -14 }),
            goto: function (s) { return s.busted ? "bust" : "win"; } },
          { label: "Full send. On a Friday. What could go wrong?",
            match: ["full", "friday", "send", "yolo"],
            effect: step({ progress: 10, morale: -16, coffee: -10 }),
            goto: function (s) { return s.busted ? "bust" : "win"; } },
          { label: "Shadow-deploy and compare against the old system.",
            match: ["shadow", "compare"],
            effect: step({ progress: 16, compute: -12, morale: 4 }),
            goto: function (s) { return s.busted ? "bust" : "win"; } }
        ]
      },

      /* ---- endings ---- */
      win: {
        end: true,
        text: function (s) {
          var head = [["tok-celebrate", "★ YOU REACHED PRODUCTION ★\n\n"]];
          var grade;
          if (s.progress >= 85) grade = "It ships — and it holds. Dashboards green, on-call quiet. Promo season.";
          else if (s.progress >= 60) grade = "Shipped. A few rough edges, but it's live and it's yours.";
          else grade = "It's in prod... technically. Good luck to whoever's on-call tonight.";
          return head.concat([
            [null, grade + "\n\n"],
            ["tok-comment", "final progress " + s.progress + "% · morale " + s.morale + " · compute " + s.compute + " · coffee " + s.coffee + "\n"]
          ]);
        }
      },

      bust: {
        end: true,
        text: function (s) {
          var why = {
            compute: "You torched the entire GPU budget. Finance pulls the plug on the project.",
            coffee: "You run bone dry on caffeine and sleep for a week. The quarter ends without you.",
            morale: "Burnout wins. You close the laptop and go outside. (Honestly? Good call.)"
          }[s.bust] || "The run ends here.";
          return [
            ["tok-comment", "✗ THE TRAIL ENDS HERE\n\n"],
            [null, why + "\n\n"],
            ["tok-comment", "made it to " + s.progress + "% before the wheels came off.\n"]
          ];
        }
      }
    }
  });
})();
