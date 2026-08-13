import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { enterTransition } from "./transitions";

type Direction = "up" | "down" | "left" | "right" | "none";

type AnimatedContentProps = {
  children: ReactNode;
  /** Where the content travels *from*. "none" fades in place. */
  direction?: Direction;
  /** Travel distance in pixels. */
  distance?: number;
  delay?: number;
  /** Wait until the element scrolls into view instead of animating on mount. */
  whenInView?: boolean;
  /** Slight scale-up on entry — reserve it for hero-sized surfaces. */
  scale?: boolean;
  className?: string;
};

const offsetFor = (direction: Direction, distance: number) => {
  switch (direction) {
    case "up":
      return { y: distance };
    case "down":
      return { y: -distance };
    case "left":
      return { x: distance };
    case "right":
      return { x: -distance };
    default:
      return {};
  }
};

/**
 * Reveal wrapper: fades content in from a direction, once.
 *
 * The workhorse behind every "this section just appeared" moment in the app.
 * Under `prefers-reduced-motion` it renders the final state immediately rather
 * than animating a shorter version — a reduced animation is still an animation.
 */
function AnimatedContent({
  children,
  direction = "up",
  distance = 16,
  delay = 0,
  whenInView = false,
  scale = false,
  className,
}: AnimatedContentProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const hidden = {
    opacity: 0,
    ...offsetFor(direction, distance),
    ...(scale ? { scale: 0.97 } : {}),
  };
  const visible = { opacity: 1, x: 0, y: 0, scale: 1 };

  return (
    <motion.div
      className={className}
      initial={hidden}
      {...(whenInView
        ? { whileInView: visible, viewport: { once: true, amount: 0.2 } }
        : { animate: visible })}
      transition={{ ...enterTransition, delay }}
    >
      {children}
    </motion.div>
  );
}

export { AnimatedContent };
