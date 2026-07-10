import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
      <div className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.35em] text-white/45">
          Authentication
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-white/60">{description}</p>
      </div>

      <div className="grid gap-5">{children}</div>
    </section>
  );
}