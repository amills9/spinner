import React, { useEffect, useRef } from "react";

const ITEM_HEIGHT = 98; // window is 110px tall with a 6px border on each side (box-sizing: border-box) → 98px of actually visible interior

export default function Reel({ pool, finalValue, spinToken, duration = 2400 }) {
  const trackRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !finalValue) return;

    const loops = 7;
    const strip = [];
    for (let i = 0; i < loops; i++) {
      pool.forEach((w) => strip.push(w));
    }
    strip.push(finalValue);

    track.innerHTML = "";
    strip.forEach((word) => {
      const div = document.createElement("div");
      div.className = "reel-item";
      div.textContent = word;
      track.appendChild(div);
    });

    track.style.transition = "none";
    track.style.top = "0px";
    // eslint-disable-next-line no-unused-expressions
    track.offsetHeight; // force reflow
    track.style.transition = `top ${duration}ms cubic-bezier(0.15, 0.85, 0.3, 1)`;
    track.style.top = `-${(strip.length - 1) * ITEM_HEIGHT}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken]);

  return (
    <div className="reel" ref={trackRef}>
      <div className="reel-item">{finalValue || pool[0] || ""}</div>
    </div>
  );
}
