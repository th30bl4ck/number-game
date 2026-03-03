import { useEffect, useMemo, useState } from "react";
import "./App.css";

/* ---------- Seeded Random ---------- */
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
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
  next.setHours(24, 0, 0, 0); // next day at 00:00:00.000 local time
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
    makeTarget: (nums) => nums[0] * nums[1] + nums[2] + (nums[3] ?? 0),
  },
  medium: {
    label: "Medium",
    count: 5,
    makeTarget: (nums) => nums[0] * nums[1] + nums[2] * nums[3] - nums[4],
  },
  hard: {
    label: "Hard",
    count: 6,
    makeTarget: (nums) =>
      nums[0] * nums[1] + nums[2] * nums[3] + nums[4] - nums[5],
  },
};

/* ---------- Generate Daily Puzzle (per difficulty) ---------- */
function generateDailyPuzzle(difficulty) {
  const today = new Date();

  const startDate = new Date(2026, 0, 1); // change later to launch date
  const basePuzzleNumber = daysSince(startDate, today) + 1;

  const seed =
    today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

  const diffOffset =
    difficulty === "easy" ? 111 : difficulty === "medium" ? 222 : 333;

  const meta = DIFF_META[difficulty];

  const nums = Array.from({ length: meta.count }, (_, i) => {
    return Math.floor(seededRandom(seed + diffOffset + i + 1) * 9) + 1;
  });

  let target = meta.makeTarget(nums);

  target = clampInt(
    target,
    6,
    difficulty === "easy" ? 60 : difficulty === "medium" ? 120 : 200
  );

  const shuffled = [...nums].sort(() => seededRandom(seed + diffOffset) - 0.5);

  return {
    difficulty,
    numbers: shuffled,
    target,
    puzzleNumber: basePuzzleNumber,
    dateKey: dateKeyLocal(today),
  };
}

/* ---------- Storage Keys (per difficulty) ---------- */
function keyFor(diff, name) {
  return `eqb:${diff}:${name}`;
}

function parseSolvedExprToTokens(solvedExpr) {
  if (!solvedExpr) return [];
  return solvedExpr.split(" ").map((t) => {
    const num = Number(t);
    return Number.isNaN(num) ? t : num;
  });
}

export default function App() {
  const [difficulty, setDifficulty] = useState("easy");
  const puzzle = useMemo(() => generateDailyPuzzle(difficulty), [difficulty]);

  const [tokens, setTokens] = useState([]);
  const [usedIndexes, setUsedIndexes] = useState([]);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [completed, setCompleted] = useState(false);
  const [streak, setStreak] = useState(0);

  // ✅ Countdown state
  const [timeToNext, setTimeToNext] = useState("");

  /* ---------- Load state for selected difficulty ---------- */
  useEffect(() => {
    const completedDate = localStorage.getItem(
      keyFor(difficulty, "completedDate")
    );
    const storedStreak = parseInt(
      localStorage.getItem(keyFor(difficulty, "streak")) || "0",
      10
    );

    const doneToday = completedDate === puzzle.dateKey;

    setCompleted(doneToday);
    setStreak(storedStreak);

    if (doneToday) {
      const solvedExpr =
        localStorage.getItem(keyFor(difficulty, "solvedExpr")) || "";
      setTokens(parseSolvedExprToTokens(solvedExpr));
      setUsedIndexes(puzzle.numbers.map((_, i) => i));
      setMessage({ text: "🎉 Completed! Come back tomorrow.", type: "success" });
    } else {
      localStorage.removeItem(keyFor(difficulty, "solvedExpr"));
      setTokens([]);
      setUsedIndexes([]);
      setMessage({ text: "", type: "" });
    }
  }, [difficulty, puzzle.dateKey, puzzle.numbers]);

  /* ---------- Countdown Timer (updates every second) ---------- */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextMidnight = getNextLocalMidnight(now);
      setTimeToNext(formatHHMMSS(nextMidnight - now));
    };

    tick(); // run immediately
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ---------- Input ---------- */
  const addNumber = (num, index) => {
    if (completed) return;
    if (usedIndexes.includes(index)) return;
    setTokens((t) => [...t, num]);
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
    const newTokens = tokens.slice(0, -1);

    if (typeof last === "number") {
      setUsedIndexes((u) => u.slice(0, -1));
    }

    setTokens(newTokens);
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

    try {
      const exprNoSpaces = tokens.join("");
      const result = eval(exprNoSpaces);

      if (result === puzzle.target) {
        setCompleted(true);
        setMessage({
          text: "🎉 Completed! Come back tomorrow.",
          type: "success",
        });

        const solvedExpr = tokens.join(" ");
        localStorage.setItem(keyFor(difficulty, "solvedExpr"), solvedExpr);

        const lastCompleted = localStorage.getItem(
          keyFor(difficulty, "completedDate")
        );

        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yesterdayKey = dateKeyLocal(y);

        let newStreak = 1;
        if (lastCompleted === yesterdayKey) newStreak = streak + 1;

        localStorage.setItem(keyFor(difficulty, "streak"), String(newStreak));
        localStorage.setItem(
          keyFor(difficulty, "completedDate"),
          puzzle.dateKey
        );
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

Play: https://th30bl4ck.github.io/number-game/
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

      {/* ✅ Countdown appears after completion */}
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