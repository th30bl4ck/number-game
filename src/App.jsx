import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* ---------- Seeded Random ---------- */
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function makeRng(seed) {
  let s = seed;
  return () => {
    // deterministic "random"
    s += 1;
    return seededRandom(s);
  };
}

/* ---------- Helpers ---------- */
function dateKeyLocal(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function daysSince(startDate, today = new Date()) {
  return Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
}

function clampInt(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* ---------- Countdown Helpers ---------- */
function getNextLocalMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}

function formatHHMMSS(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/* ---------- Difficulty Config ---------- */
const DIFFS = ["easy", "medium", "hard"];

const DIFF_META = {
  easy: {
    label: "Easy",
    count: 4,
    targetMax: 60,
    // Easy doesn't require all numbers
    requireAll: false,
    // Some easy puzzles will need brackets, but not always
    bracketChance: 0.25,
  },
  medium: {
    label: "Medium",
    count: 5,
    targetMax: 120,
    requireAll: true,
    bracketChance: 0.45,
  },
  hard: {
    label: "Hard",
    count: 6,
    targetMax: 200,
    // ✅ Hard must use all numbers
    requireAll: true,
    // Hard more often needs brackets
    bracketChance: 0.65,
  },
};

/* ---------- Expression Tree Generator (more variation) ---------- */
/**
 * Builds a guaranteed-solvable target by creating a random expression from the numbers.
 * Returns { target, solutionExpr, usesBrackets }.
 *
 * To keep the game casual (no crazy fractions), division is only allowed when divisible.
 * Intermediate values are kept integers.
 */
function buildRandomSolution(nums, rng, bracketChance) {
  // Each node: { value: number, expr: string }
  let nodes = nums.map((n) => ({ value: n, expr: String(n) }));

  const ops = ["+", "-", "*", "/"];

  let usesBrackets = false;

  while (nodes.length > 1) {
    // pick 2 distinct indices
    const i = Math.floor(rng() * nodes.length);
    let j = Math.floor(rng() * (nodes.length - 1));
    if (j >= i) j += 1;

    const A = nodes[i];
    const B = nodes[j];

    // remove higher index first
    const hi = Math.max(i, j);
    const lo = Math.min(i, j);
    nodes.splice(hi, 1);
    nodes.splice(lo, 1);

    // choose op with some bias to avoid huge blowups
    let op = ops[Math.floor(rng() * ops.length)];

    // try a few times to get a "valid" integer operation
    let combined = null;
    for (let attempt = 0; attempt < 12 && !combined; attempt++) {
      op = ops[Math.floor(rng() * ops.length)];

      if (op === "+") {
        combined = {
          value: A.value + B.value,
          expr: `${A.expr} + ${B.expr}`,
        };
      } else if (op === "-") {
        // keep it non-negative-ish by ordering (still allows zero)
        const left = A.value >= B.value ? A : B;
        const right = A.value >= B.value ? B : A;
        combined = {
          value: left.value - right.value,
          expr: `${left.expr} - ${right.expr}`,
        };
      } else if (op === "*") {
        combined = {
          value: A.value * B.value,
          expr: `${A.expr} * ${B.expr}`,
        };
      } else if (op === "/") {
        // only allow divisible divisions
        const left = A.value >= B.value ? A : B;
        const right = A.value >= B.value ? B : A;
        if (right.value !== 0 && left.value % right.value === 0) {
          combined = {
            value: left.value / right.value,
            expr: `${left.expr} / ${right.expr}`,
          };
        }
      }
    }

    // if we failed to find a valid combine, just do addition (always valid)
    if (!combined) {
      combined = {
        value: A.value + B.value,
        expr: `${A.expr} + ${B.expr}`,
      };
    }

    // Sometimes wrap in brackets
    if (rng() < bracketChance) {
      combined.expr = `(${combined.expr})`;
      usesBrackets = true;
    }

    nodes.push(combined);
  }

  const final = nodes[0];
  return { target: final.value, solutionExpr: final.expr, usesBrackets };
}

/* ---------- Generate Daily Puzzle (per difficulty) ---------- */
function generateDailyPuzzle(difficulty) {
  const today = new Date();
  const meta = DIFF_META[difficulty];

  // puzzle number (days since launch)
  const startDate = new Date(2026, 0, 1); // change later to your launch date
  const basePuzzleNumber = daysSince(startDate, today) + 1;

  // base seed from date
  const baseSeed =
    today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  // difficulty offset so each tab is a different daily puzzle
  const diffOffset = difficulty === "easy" ? 111 : difficulty === "medium" ? 222 : 333;

  // deterministic RNG for the day + diff
  const rng = makeRng(baseSeed + diffOffset);

  // number ranges by difficulty (adds variation)
  const maxNum = difficulty === "easy" ? 9 : difficulty === "medium" ? 12 : 15;
  const minNum = difficulty === "hard" ? 2 : 1;

  // generate numbers
  const nums = Array.from({ length: meta.count }, () => {
    return Math.floor(rng() * (maxNum - minNum + 1)) + minNum;
  });

  // build a solvable target with varied structure
  // we retry until target is in a nice range and not too tiny
  let solution = null;
  for (let tries = 0; tries < 250; tries++) {
    const attempt = buildRandomSolution(nums, rng, meta.bracketChance);

    // keep targets friendly
    const t = attempt.target;

    // avoid super tiny or super huge
    if (t >= 6 && t <= meta.targetMax) {
      solution = attempt;
      break;
    }
  }

  // fallback if unlucky (still solvable)
  if (!solution) {
    solution = buildRandomSolution(nums, rng, meta.bracketChance);
    solution.target = clampInt(solution.target, 6, meta.targetMax);
  }

  // shuffle numbers deterministically for display
  const shuffled = [...nums].sort(() => rng() - 0.5);

  return {
    difficulty,
    numbers: shuffled,
    target: solution.target,
    puzzleNumber: basePuzzleNumber,
    dateKey: dateKeyLocal(today),

    // (we keep this for future hints if you want)
    solutionExpr: solution.solutionExpr,
    usesBrackets: solution.usesBrackets,
    requireAll: meta.requireAll,
  };
}

/* ---------- Storage Keys (per difficulty) ---------- */
function keyFor(diff, name) {
  return `eqb:${diff}:${name}`;
}

export default function App() {
  const [difficulty, setDifficulty] = useState("easy");
  const puzzle = useMemo(() => generateDailyPuzzle(difficulty), [difficulty]);

  const [tokens, setTokens] = useState([]);
  const [usedIndexes, setUsedIndexes] = useState([]);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [completed, setCompleted] = useState(false);
  const [streak, setStreak] = useState(0);

  const [timeToNext, setTimeToNext] = useState("");

  /* ---------- Load state for selected difficulty ---------- */
  useEffect(() => {
    const completedDate = localStorage.getItem(keyFor(difficulty, "completedDate"));
    const storedStreak = parseInt(localStorage.getItem(keyFor(difficulty, "streak")) || "0", 10);
    const doneToday = completedDate === puzzle.dateKey;

    setCompleted(doneToday);
    setStreak(storedStreak);

    if (doneToday) {
      const solvedExpr = localStorage.getItem(keyFor(difficulty, "solvedExpr")) || "";
      // show saved solved expression in the box
      setTokens(solvedExpr ? solvedExpr.split(" ") : []);
      setUsedIndexes(puzzle.numbers.map((_, i) => i));
      setMessage({ text: "🎉 Completed! Come back tomorrow.", type: "success" });
    } else {
      localStorage.removeItem(keyFor(difficulty, "solvedExpr"));
      setTokens([]);
      setUsedIndexes([]);
      setMessage({ text: "", type: "" });
    }
  }, [difficulty, puzzle.dateKey, puzzle.numbers]);

  /* ---------- Countdown ---------- */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeToNext(formatHHMMSS(getNextLocalMidnight(now) - now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ---------- Input ---------- */
  const addNumber = (num, index) => {
    if (completed) return;
    if (usedIndexes.includes(index)) return;

    setTokens((t) => [...t, String(num)]);
    setUsedIndexes((u) => [...u, index]);
  };

  const addOperator = (op) => {
    if (completed) return;
    setTokens((t) => [...t, op]);
  };

  const deleteLast = () => {
    if (completed) return;
    if (tokens.length === 0) return;

    const last = tokens[tokens.length - 1];
    setTokens((t) => t.slice(0, -1));

    // if last token was a number, free the last used index
    if (!isNaN(Number(last))) {
      setUsedIndexes((u) => u.slice(0, -1));
    }
  };

  const clearAll = () => {
    if (completed) return;
    setTokens([]);
    setUsedIndexes([]);
    setMessage({ text: "", type: "" });
  };

  /* ---------- Check ---------- */
  const checkAnswer = () => {
    if (completed) return;

    // ✅ Hard must use all numbers
    if (puzzle.requireAll && usedIndexes.length !== puzzle.numbers.length) {
      setMessage({
        text: "Hard mode: you must use ALL numbers.",
        type: "error",
      });
      return;
    }

    try {
      const exprNoSpaces = tokens.join("");
      const result = eval(exprNoSpaces);

      if (result === puzzle.target) {
        setCompleted(true);
        setMessage({ text: "🎉 Completed! Come back tomorrow.", type: "success" });

        const solvedExpr = tokens.join(" ");
        localStorage.setItem(keyFor(difficulty, "solvedExpr"), solvedExpr);

        const lastCompleted = localStorage.getItem(keyFor(difficulty, "completedDate"));
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yesterdayKey = dateKeyLocal(y);

        let newStreak = 1;
        if (lastCompleted === yesterdayKey) newStreak = streak + 1;

        localStorage.setItem(keyFor(difficulty, "streak"), String(newStreak));
        localStorage.setItem(keyFor(difficulty, "completedDate"), puzzle.dateKey);
        setStreak(newStreak);
      } else {
        setMessage({ text: "Not quite — try another combo.", type: "error" });
      }
    } catch {
      setMessage({ text: "Invalid expression.", type: "error" });
    }
  };

  /* ---------- Share (after win) ---------- */
  const handleShare = () => {
    const shareText = `
Equation Builder – ${DIFF_META[difficulty].label} – Puzzle #${puzzle.puzzleNumber}
Target: ${puzzle.target}
🔥 ${streak} Day Streak
🟩 Completed

Play:https://th30bl4ck.github.io/number-game/
    `.trim();

    navigator.clipboard.writeText(shareText);
    alert("Copied to clipboard!");
  };

  return (
    <div className="container">
      <h1>Equation Builder</h1>

      {/* Tabs */}
      <div className="tabs">
        {DIFFS.map((d) => (
          <button
            key={d}
            className={`tab ${difficulty === d ? "active" : ""}`}
            onClick={() => setDifficulty(d)}
          >
            {DIFF_META[d].label}
          </button>
        ))}
      </div>

      <div className="streak">🔥 {streak} Day Streak</div>

      <div className="puzzle-number">
        {DIFF_META[difficulty].label} · Puzzle #{puzzle.puzzleNumber}
      </div>

      <div className="target">
        Target:
        <span>{puzzle.target}</span>
      </div>

      <div className="tiles">
        {puzzle.numbers.map((num, i) => (
          <button
            key={i}
            className={usedIndexes.includes(i) ? "used" : ""}
            onClick={() => addNumber(num, i)}
            disabled={completed}
          >
            {num}
          </button>
        ))}
      </div>

      <div className="operators">
        {["+", "-", "*", "/", "(", ")"].map((op) => (
          <button key={op} onClick={() => addOperator(op)} disabled={completed}>
            {op}
          </button>
        ))}
        <button className="delete" onClick={deleteLast} disabled={completed}>
          ⌫
        </button>
      </div>

      <div className="expression">
        {tokens.length > 0 ? tokens.join(" ") : "Build your equation..."}
      </div>

      <div className="actions">
        <button onClick={checkAnswer} disabled={completed}>
          Check
        </button>
        <button onClick={clearAll} disabled={completed}>
          Clear
        </button>
      </div>

      <div className={`message ${message.type}`}>{message.text}</div>

      {completed && (
        <div className="countdown">
          New puzzle in <span>{timeToNext}</span>
        </div>
      )}

      {completed && (
        <button className="share" onClick={handleShare}>
          Share Result
        </button>
      )}
    </div>
  );
}