"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Calendar, Users, GraduationCap, AlertTriangle, BarChart3, LayoutDashboard, Menu, X, LogOut } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/students", label: "Students", icon: GraduationCap },
  { href: "/callouts", label: "Callouts", icon: AlertTriangle },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login") return null;

  return (
    <nav className="bg-white border-b border-gray-200 print:hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-12">
          <Link href="/" className="font-bold text-base text-blue-700 shrink-0 tracking-tight">
            Staff Scheduler
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0.5">
            {links.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                  )}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <LogOut size={15} />
            </button>
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setOpen(o => !o)} className="md:hidden p-2 -mr-2 text-gray-500">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {open && (
        <div className="md:hidden border-t bg-white px-4 pb-3 pt-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium",
                  active ? "bg-blue-50 text-blue-700" : "text-gray-600"
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-red-500 w-full mt-1 border-t pt-3"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
