import { motion, useReducedMotion } from "motion/react";
import type { ElementType } from "react";

import { EASE_OUT } from "./transitions";

type BlurTextProps = {
  text: string;
  /** Render as any heading/paragraph tag; defaults to a span. */
  as?: ElementType;
  className?: string;
  delay?: number;
  /** Seconds between successive words. */
  step?: number;
};

/**
 * Heading that resolves word by word out of a blur.
 *
 * Words — not characters. Character staggers on a real sentence read as a
 * typewriter gimmick and delay comprehension; word staggers just make the line
 * land. The text stays in the DOM as one string for screen readers because
 * every word carries the same accessible label sequence in order.
 */
function BlurText({
  text,
  as: Tag = "span",
  className,
  delay = 0,
  step = 0.08,
}: BlurTextProps) {
  const prefersReducedMotion = useReducedMotion();
  const words = text.split(" ");

  if (prefersReducedMotion) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag className={className}>
      {words.map((word, index) => (
        <motion.span
          // Words repeat inside a sentence, so position is the only stable key.
          key={`${word}-${index}`}
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: "0.35em", filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.55,
            ease: EASE_OUT,
            delay: delay + index * step,
          }}
        >
          {index === words.length - 1 ? word : `${word} `}
        </motion.span>
      ))}
    </Tag>
  );
}

export { BlurText };
