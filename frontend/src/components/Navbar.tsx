import { Home, Search, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/AuthContext";
import { BrandMark } from "./BrandMark";

type NavItem = {
  label: string;
  to: string;
  active: boolean;
  icon: typeof Home;
};

function Navbar() {
  const { pathname } = useLocation();
  const { user } = useAuth();

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

  const fullName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim();
  const displayName = fullName || user?.phone_number || "You";
  const initials =
    [user?.first_name, user?.last_name]
      .map((name) => name?.trim().charAt(0) ?? "")
      .join("")
      .toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/home" aria-label="Go to home" className="shrink-0">
          <BrandMark />
        </Link>

        <div className="flex items-center gap-2">
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 rounded-2xl border border-border bg-white/[0.03] p-1"
          >
            {items.map(({ to, label, active, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                  active
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <Link
            to="/settings"
            aria-label="Your account"
            className="rounded-full outline-none ring-primary/50 transition focus-visible:ring-[3px]"
          >
            <Avatar className="size-9 border border-border">
              {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/20 text-xs font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
