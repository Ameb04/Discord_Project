import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { enterTransition, staggerDelay } from "./transitions";

type AnimatedListItemProps = {
  children: ReactNode;
  /** Position in the list; drives the stagger. */
  index?: number;
  className?: string;
};

/**
 * One row of a staggered list.
 *
 * Rendered as `<li>` because every list in this app is a real `<ul>` — dropping
 * a `<div>` between them would break the list semantics screen readers rely on.
 * Wrap the group in `<AnimatedListPresence>` when rows can be removed, so the
 * exit animation has somewhere to run.
 */
function AnimatedListItem({
  children,
  index = 0,
  className,
}: AnimatedListItemProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <li className={className}>{children}</li>;
  }

  return (
    <motion.li
      layout
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ ...enterTransition, delay: staggerDelay(index) }}
    >
      {children}
    </motion.li>
  );
}

/**
 * Presence boundary for a list whose rows can disappear.
 *
 * `popLayout` keeps the surviving rows sliding up smoothly while the removed
 * one fades, instead of the list snapping closed underneath it.
 */
function AnimatedListPresence({ children }: { children: ReactNode }) {
  return <AnimatePresence mode="popLayout">{children}</AnimatePresence>;
}

export { AnimatedListItem, AnimatedListPresence };
