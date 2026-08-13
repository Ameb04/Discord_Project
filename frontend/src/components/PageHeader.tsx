import type { ReactNode } from "react";

import { AnimatedContent } from "@/components/motion/AnimatedContent";
import { BlurText } from "@/components/motion/BlurText";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow ? (
          <AnimatedContent direction="up" distance={8}>
            <p className="text-xs font-medium tracking-[0.2em] text-primary/80 uppercase">
              {eyebrow}
            </p>
          </AnimatedContent>
        ) : null}
        <BlurText
          as="h1"
          text={title}
          delay={0.08}
          className="mt-2 block text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        />
        {description ? (
          <AnimatedContent direction="up" distance={8} delay={0.24}>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </AnimatedContent>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
