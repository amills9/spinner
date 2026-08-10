import React, { useEffect, useState } from "react";

const COLORS = ["#FF6FA5", "#FFC93C", "#2EC4B6", "#7B61FF"];

export default function Confetti({ trigger }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    const next = Array.from({ length: 26 }).map((_, i) => ({
      id: `${trigger}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.6 + Math.random() * 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    setPieces(next);
    const timeout = setTimeout(() => setPieces([]), 3200);
    return () => clearTimeout(timeout);
  }, [trigger]);

  return (
    <>
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </>
  );
}
