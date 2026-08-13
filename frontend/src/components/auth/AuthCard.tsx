import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section className="w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      {children}
    </section>
  );
}
