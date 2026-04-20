"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Mail, BarChart3, Settings } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) return null;

  const navLinks = [
    { name: "Board", href: "/board", icon: LayoutDashboard },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/board" className="flex items-center gap-2">
              <div className="bg-primary p-1.5 rounded-md bg-blue-600">
                <Mail className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">
                Outreach<span className="text-blue-500">Auto</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                      isActive
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
