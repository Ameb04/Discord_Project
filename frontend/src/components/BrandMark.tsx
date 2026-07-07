const APP_NAME = "Discord Project";

export function BrandMark() {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative h-11 w-11 rounded-2xl border border-white/15 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-white to-zinc-500" />
        <div className="absolute left-2.5 top-2.5 h-3.5 w-3.5 rounded-full border border-black/40 bg-black/90" />
        <div className="absolute bottom-2.5 right-2.5 h-2 w-2 rounded-full bg-white/80" />
      </div>

      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">Silver UI</p>
        <p className="text-lg font-semibold tracking-tight text-white">{APP_NAME}</p>
      </div>
    </div>
  );
}