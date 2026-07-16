import { Home, MessageCircle, Search, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  to: string;
  active: boolean;
  icon: typeof Home;
};

function Navbar() {
  const { pathname } = useLocation();

  const items: NavItem[] = [
    {
      label: "Home",
      to: "/home",
      active: pathname === "/home" || pathname.startsWith("/chats/"),
      icon: Home,
    },
    {
      label: "Search",
      to: "/search",
      active: pathname.startsWith("/search"),
      icon: Search,
    },
    {
      label: "Settings",
      to: "/settings",
      active: pathname.startsWith("/settings"),
      icon: Settings,
    },
  ];

  return (
    <header className="border-b border-white/10 bg-[#090909]/95 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/home" className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.06]">
            <MessageCircle className="size-5 text-white" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none text-white">Discord Project</p>
            <p className="mt-1 text-xs text-white/45">Messages, groups, and channels</p>
          </div>
        </Link>

        <nav
          aria-label="Main navigation"
          className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1"
        >
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                  item.active
                    ? "bg-white text-black"
                    : "text-white/65 hover:bg-white/[0.05] hover:text-white"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;