import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { useRef, type PointerEvent, type ReactNode } from "react";

import { springTransition } from "./transitions";

type MagnetProps = {
  children: ReactNode;
  /** How far the element may be pulled from centre, in pixels. */
  strength?: number;
  className?: string;
};

/**
 * Leans its child toward the pointer while hovered.
 *
 * Only worth it on a page's single most important call to action — applied
 * broadly it turns a calm layout into a twitchy one. Pointer-driven, so it
 * never fires on touch, and it is skipped entirely under reduced motion.
 */
function Magnet({ children, strength = 8, className }: MagnetProps) {
  const prefersReducedMotion = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const offsetX = useSpring(useMotionValue(0), springTransition);
  const offsetY = useSpring(useMotionValue(0), springTransition);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds) return;

    // Normalise the pointer to [-1, 1] across the element, then scale.
    const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
    const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;
    offsetX.set(relativeX * strength * 2);
    offsetY.set(relativeY * strength * 2);
  }

  function reset() {
    offsetX.set(0);
    offsetY.set(0);
  }

  return (
    <motion.div
      ref={wrapperRef}
      className={className}
      style={{ x: offsetX, y: offsetY }}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}

export { Magnet };
