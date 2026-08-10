import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import Reel from "../components/Reel.jsx";
import Confetti from "../components/Confetti.jsx";
import "../styles/spinner.css";

const WORD_POOL_FALLBACK = ["battery", "volcano", "dragon", "sandwich", "kangaroo"];
const STYLE_POOL_FALLBACK = ["narrative", "informative", "recount", "persuasive", "descriptive", "imaginative"];

const WORD_SPIN_DURATION = 2600;
const STYLE_SPIN_DURATION = 2100;

const DEFAULT_SESSION = {
  spinsUsed: 0,
  spinsRemaining: 3,
  word: null,
  style: null,
  wordLocked: false,
  styleLocked: false,
  finalized: false,
};

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function formatCountdown(ms) {
  if (ms <= 0) return "any moment now";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function Spinner() {
  const [session, setSession] = useState(DEFAULT_SESSION);
  const [testingMode, setTestingMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [confettiToken, setConfettiToken] = useState(0);
  const [countdown, setCountdown] = useState(msUntilNextMidnight());

  // What the reels actually display/animate toward — kept separate from
  // `session` so a locked reel never animates, and an unlocked one animates
  // toward the *new* result rather than last spin's.
  const [reelWord, setReelWord] = useState(null);
  const [reelStyle, setReelStyle] = useState(null);
  const [wordSpinToken, setWordSpinToken] = useState(0);
  const [styleSpinToken, setStyleSpinToken] = useState(0);

  const timerRef = useRef(null);

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch("/api/today");
      const data = await res.json();
      setSession(data.session);
      setReelWord(data.session.word);
      setReelStyle(data.session.style);
      setTestingMode(data.testingMode);
    } catch (e) {
      setError("Couldn't reach the spinner right now — try again in a bit.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const fromStr = from.toISOString().slice(0, 10);
      const res = await fetch(`/api/history?from=${fromStr}`);
      const data = await res.json();
      setHistory(data.slice(0, 7));
    } catch (e) {
      // Non-critical for the kid-facing view; fail quietly.
    }
  }, []);

  useEffect(() => {
    loadToday();
    loadHistory();
  }, [loadToday, loadHistory]);

  useEffect(() => {
    const interval = setInterval(() => setCountdown(msUntilNextMidnight()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSpin = async () => {
    if (spinning || session.finalized || session.spinsRemaining <= 0) return;
    if (session.wordLocked && session.styleLocked) return;

    const wordWillAnimate = !session.wordLocked;
    const styleWillAnimate = !session.styleLocked;

    setSpinning(true);
    setError(null);
    try {
      const res = await fetch("/api/spin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Spin failed");

      setReelWord(data.session.word);
      setReelStyle(data.session.style);
      if (wordWillAnimate) setWordSpinToken((t) => t + 1);
      if (styleWillAnimate) setStyleSpinToken((t) => t + 1);

      const delay =
        Math.max(wordWillAnimate ? WORD_SPIN_DURATION : 0, styleWillAnimate ? STYLE_SPIN_DURATION : 0) + 50;

      timerRef.current = setTimeout(() => {
        setSession(data.session);
        setSpinning(false);
        if (data.session.finalized) {
          setConfettiToken((t) => t + 1);
          setCountdown(msUntilNextMidnight());
        }
        loadHistory();
      }, delay);
    } catch (e) {
      setError("The spinner got stuck — give it another go!");
      setSpinning(false);
    }
  };

  const toggleLock = async (which) => {
    if (spinning || session.finalized) return;
    const body =
      which === "word" ? { wordLocked: !session.wordLocked } : { styleLocked: !session.styleLocked };
    try {
      const res = await fetch("/api/today/locks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) setSession(data.session);
    } catch (e) {
      // Non-critical — lock state just won't update; leave existing state as is.
    }
  };

  const handleLockIn = async () => {
    if (spinning || session.finalized || session.spinsUsed === 0) return;
    setError(null);
    try {
      const res = await fetch("/api/today/lock-in", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't lock in");
      setSession(data.session);
      setReelWord(data.session.word);
      setReelStyle(data.session.style);
      setConfettiToken((t) => t + 1);
      setCountdown(msUntilNextMidnight());
      loadHistory();
    } catch (e) {
      setError(e.message);
    }
  };

  const canSpin = !session.finalized && session.spinsRemaining > 0 && !(session.wordLocked && session.styleLocked);
  const showLockButtons = !session.finalized && session.spinsUsed > 0;
  const showLockIn = !session.finalized && session.spinsUsed > 0;

  return (
    <div className="stage">
      <Confetti trigger={confettiToken} />
      <h1 className="title">Spin your story!</h1>
      <p className="subtitle">Pull the lever and get today's writing challenge</p>
      {testingMode && <p className="testing-banner">Testing mode — daily limit is off</p>}

      {!loading && !session.finalized && (
        <p className="spins-remaining">
          {session.spinsRemaining} spin{session.spinsRemaining === 1 ? "" : "s"} left today
        </p>
      )}

      <div className="cabinet">
        <div className="windows">
          <div className="window-wrap">
            <span className="window-label">Word</span>
            <div className="window">
              <Reel
                pool={WORD_POOL_FALLBACK}
                finalValue={reelWord}
                spinToken={wordSpinToken}
                duration={WORD_SPIN_DURATION}
              />
            </div>
            {showLockButtons && (
              <button
                className={`lock-toggle ${session.wordLocked ? "locked" : ""}`}
                onClick={() => toggleLock("word")}
              >
                {session.wordLocked ? "🔒 Word locked" : "🔓 Lock word"}
              </button>
            )}
          </div>
          <div className="window-wrap">
            <span className="window-label">Style</span>
            <div className="window style-window">
              <Reel
                pool={STYLE_POOL_FALLBACK}
                finalValue={reelStyle}
                spinToken={styleSpinToken}
                duration={STYLE_SPIN_DURATION}
              />
            </div>
            {showLockButtons && (
              <button
                className={`lock-toggle ${session.styleLocked ? "locked" : ""}`}
                onClick={() => toggleLock("style")}
              >
                {session.styleLocked ? "🔒 Style locked" : "🔓 Lock style"}
              </button>
            )}
          </div>
        </div>
      </div>

      {!loading && canSpin && (
        <div className="spin-button-wrap">
          <button className="spin-button" onClick={handleSpin} disabled={spinning}>
            {spinning ? "Spinning..." : "Spin!"}
          </button>
        </div>
      )}

      {!loading && showLockIn && (
        <div className="lock-in-wrap">
          <button className="lock-in-button" onClick={handleLockIn} disabled={spinning}>
            Locked in? Tap to finish
          </button>
        </div>
      )}

      {!loading && session.finalized && (
        <p className="waiting-message">
          You've used today's spins — come back in {formatCountdown(countdown)}!
        </p>
      )}

      {!loading && session.word && (
        <div className="ticket">
          <p className="ticket-eyebrow">{session.finalized ? "Today's challenge" : "So far..."}</p>
          <p className="ticket-word">{session.word}</p>
          <span className="ticket-style">{session.style}</span>
        </div>
      )}

      {error && <p className="waiting-message" style={{ color: "#D9447C" }}>{error}</p>}

      {history.length > 0 && (
        <div className="history-strip">
          <p className="history-title">This week's challenges</p>
          <div className="history-row">
            {history.map((h, i) => (
              <div className="history-chip" key={`${h.spin_date}-${i}`}>
                <span className="hc-word">{h.word}</span>
                <span className="hc-style">{h.style}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link to="/admin" className="admin-link">admin</Link>
    </div>
  );
}
