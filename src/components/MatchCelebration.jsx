import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import {
  collisionMs, heartKeyframes, burstPlan, HEART_DURATION, HEART_EASING, HEART_SIZE,
  FLIGHT_MS, BOUNCE_MS, BOUNCE_KEYFRAMES,
} from "../lib/matchBurst.js";

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";
const HEART_PATH = "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";
const COLORS = { cyan: "var(--accent)", pink: "var(--heart-pink)", kernel: "var(--kernel)" };
const SAVE_TIMEOUT_MS = 6000;
const LEAVE_MS = 220;
const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const largePoster = (url) => (url ? url.replace("/w342/", "/w780/") : null);

function piece(layer, isHeart, className, color) {
  const el = document.createElement("span");
  el.className = className;
  el.style.color = color;
  if (isHeart) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", HEART_PATH);
    svg.append(path);
    el.append(svg);
  } else {
    el.classList.add("mc-kernel");
  }
  layer.append(el);
  return el;
}

// "Two hearts, one pick". A retained copy of the matched card sits between a
// rear and a front particle layer, so the real poster occludes the rear burst.
// Two hearts meet over it and the popcorn-and-heart burst launches on that same
// frame. Everything is decorative (pointer-events: none) and any tap, swipe or
// key dismisses it, so the next title stays usable underneath.
export default function MatchCelebration({ match, names, onClose, onFailed }) {
  const fxRef = useRef(null), backRef = useRef(null), frontRef = useRef(null);
  const cardRef = useRef(null), settleRef = useRef(null), hostRef = useRef(null);
  const [reduced] = useState(reducedMotion);
  const [rect, setRect] = useState(null);
  const [matched, setMatched] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef(onClose), failRef = useRef(onFailed);
  closeRef.current = onClose; failRef.current = onFailed;
  const leaveRef = useRef(null);

  // Where the card sits: the swiped card's own slot, or centered when the match
  // arrived from the partner's phone and there is no card on screen.
  useLayoutEffect(() => {
    if (reduced) return;
    const fx = fxRef.current.getBoundingClientRect();
    const o = match.origin?.rect;
    if (o) setRect({ left: o.left - fx.left, top: o.top - fx.top, width: o.width, height: o.height, fxHeight: fx.height });
    else {
      const width = Math.min(fx.width * 0.62, 270), height = width * 1.5;
      setRect({ left: (fx.width - width) / 2, top: Math.max(96, (fx.height - height) / 2 - 30), width, height, fxHeight: fx.height });
    }
  }, [match.origin, reduced]);

  // The exact card face from Discover (poster, title, scores), cloned at the
  // moment of the match so the queue moving on can't change it.
  useLayoutEffect(() => {
    if (rect && match.origin?.node && hostRef.current) hostRef.current.replaceChildren(match.origin.node);
  }, [rect, match.origin]);

  useEffect(() => {
    if (!reduced && !rect) return undefined;
    let live = true, left = false;
    const animations = [], timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const leave = () => {
      if (left) return;
      left = true;
      setLeaving(true);
      later(() => closeRef.current(), reduced ? 0 : LEAVE_MS);
    };
    leaveRef.current = leave;

    // A dragged card is released mid-tilt; ease the copy back to rest.
    const dx = match.origin?.dragX || 0;
    if (!reduced && dx && settleRef.current) {
      animations.push(settleRef.current.animate(
        [{ transform: `translateX(${dx}px) rotate(${dx / 22}deg)` }, { transform: "none" }],
        { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" },
      ));
    }

    function confirm() {
      if (reduced) {
        setMatched(true);
        later(leave, 3200);
        return;
      }
      const collide = collisionMs();
      const front = frontRef.current, back = backRef.current;
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.4;
      const shared = [];
      [-1, 1].forEach((side, i) => {
        const heart = piece(front, true, "mc-merge", i ? COLORS.pink : COLORS.cyan);
        heart.style.left = `${cx - HEART_SIZE / 2}px`;
        heart.style.top = `${cy - HEART_SIZE / 2}px`;
        shared.push(heart.animate(heartKeyframes(side), { duration: HEART_DURATION, easing: `cubic-bezier(${HEART_EASING.join(",")})`, fill: "both" }));
      });
      for (const p of burstPlan()) {
        const el = piece(p.rear ? back : front, p.heart, "mc-particle", COLORS[p.color]);
        el.style.width = el.style.height = `${p.size}px`;
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        if (p.rear) el.style.filter = "blur(.3px)";
        // Hidden until the keyframes take over on the collision frame.
        el.style.visibility = "hidden";
        shared.push(el.animate(p.frames, { duration: FLIGHT_MS, delay: collide, easing: "linear", fill: "none" }));
      }
      shared.push(cardRef.current.animate(BOUNCE_KEYFRAMES, { duration: BOUNCE_MS, delay: collide, easing: "ease-in-out" }));
      // One clock for hearts, particles and bounce: the burst starts on the
      // exact frame the hearts meet.
      const start = document.timeline.currentTime;
      shared.forEach((a) => { a.startTime = start; });
      animations.push(...shared);
      later(() => setMatched(true), collide);
      later(leave, collide + FLIGHT_MS + 150);
    }

    // Only celebrate once the like that completed the match is saved.
    const timeout = setTimeout(() => {
      if (!live) return;
      live = false;
      failRef.current?.(false);
      closeRef.current();
    }, SAVE_TIMEOUT_MS);
    Promise.resolve(match.saved).then(
      () => { if (!live) return; clearTimeout(timeout); confirm(); },
      () => { if (!live) return; live = false; clearTimeout(timeout); failRef.current?.(true); closeRef.current(); },
    );

    return () => {
      live = false;
      clearTimeout(timeout);
      timers.forEach(clearTimeout);
      animations.forEach((a) => a.cancel());
      backRef.current?.replaceChildren();
      frontRef.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, reduced]);

  // Any tap, swipe or key moves on: the celebration fades and the input still
  // reaches the app underneath.
  useEffect(() => {
    const dismiss = () => leaveRef.current?.();
    const onKey = (e) => { if (["Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(e.key)) dismiss(); };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("pointerdown", dismiss, true); window.removeEventListener("keydown", onKey, true); };
  }, []);

  // As in the approved design the confirmation sits just under the card, which
  // leaves the space above it clear for the rear burst to rise into.
  const BANNER_SPACE = 96;
  const bannerTop = rect && rect.top + rect.height + 12 + BANNER_SPACE <= rect.fxHeight ? rect.top + rect.height + 12 : null;

  const card = rect && (
    <div ref={cardRef} className="mc-card" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
      <div ref={settleRef} className="mc-settle">
        {match.origin?.node ? <div ref={hostRef} className="mc-host" /> : (
          <div className="face front">
            {match.poster ? <img className="card-img" src={largePoster(match.poster)} alt="" /> : <div className="poster-fallback big" />}
            <div className="card-shade" />
            <div className="card-overlay"><h3 className="card-title">{match.title}</h3></div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={fxRef} className={"match-fx" + (leaving ? " leaving" : "")}>
      <div ref={backRef} className="mc-particles mc-back" aria-hidden="true" />
      {card && <div aria-hidden="true">{card}</div>}
      <div ref={frontRef} className="mc-particles mc-front" aria-hidden="true" />
      {matched && (
        // Visual only: the status line below is the one announcement, and taps
        // pass straight through to the app (any tap also dismisses).
        <div className="match-layer" aria-hidden="true" style={bannerTop != null ? { top: bannerTop } : undefined}>
          <div className="match-card">
            <span className="match-avatars">
              <span className="avatar avatar-a">{initial(names[0])}</span>
              <span className="match-heart"><Heart size={13} fill="currentColor" /></span>
              <span className="avatar avatar-b">{initial(names[1])}</span>
            </span>
            <span className="match-text">
              <span className="match-title">You both picked this</span>
              <span className="match-movie">{match.title}</span>
              <span className="match-sub">Added to your list</span>
            </span>
            {match.poster && <img className="match-poster" src={match.poster} alt="" />}
          </div>
        </div>
      )}
      <span className="visually-hidden" role="status">{matched ? `You both picked ${match.title}. Added to your list.` : ""}</span>
    </div>
  );
}
