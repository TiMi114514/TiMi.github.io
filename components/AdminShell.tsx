'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Blocks,
  Bot,
  Code2,
  Database,
  Globe,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Plug,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { supabase } from '@/lib/supabase';

const navItems = [
  { href: '/admin/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'App Users', icon: Users },
  { href: '/admin/tutors', label: 'Tutors', icon: GraduationCap },
  { href: '/admin/data', label: 'Data', icon: Database },
  { href: '/admin', label: 'Analytics', icon: LineChart, exact: true },
  { href: '/admin/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/admin/domains', label: 'Domains', icon: Globe },
  { href: '/admin/integrations', label: 'Integrations', icon: Plug },
  { href: '/admin/security', label: 'Security', icon: ShieldCheck },
  { href: '/admin/code', label: 'Code', icon: Code2 },
  { href: '/admin/agents', label: 'Agents', icon: Bot },
  { href: '/admin/workflows', label: 'Workflows', icon: Workflow, badge: 'New' },
  { href: '/admin/emails', label: 'Emails', icon: Mail },
  { href: '/admin/logs', label: 'Logs', icon: ScrollText },
  { href: '/admin/api', label: 'API', icon: KeyRound },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/mcp', label: 'MCP', icon: Blocks },
  { href: '/admin/secrets', label: 'Secrets', icon: Lock },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { user, loading, isAdmin, signOut } = useAuth();
  const [query, setQuery] = useState('');
  const [pendingTutors, setPendingTutors] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!supabase || !isAdmin) return;
    let active = true;

    async function loadBadges() {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const [teachers, requests] = await Promise.all([
          supabase!
            .from('teacher_applications')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase!
            .from('human_tutor_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
        ]);
        if (!active) return;
        const total = (teachers.count ?? 0) + (requests.count ?? 0);
        if (total > 0 || attempt === 2) {
          setPendingTutors(total);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 800));
      }
    }

    void loadBadges();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadBadges();
    }, 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return navItems;
    return navItems.filter((item) => item.label.toLowerCase().includes(needle));
  }, [query]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f4f5] p-8">
        <div className="h-10 w-52 animate-pulse rounded-lg bg-[#e4e4e7]" />
        <div className="mt-6 h-80 animate-pulse rounded-xl bg-[#e4e4e7]/70" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f4f5] px-4">
        <div className="w-full max-w-md rounded-xl border border-[#e4e4e7] bg-white p-8 text-center">
          <h1 className="text-[22px] font-semibold">Sign in required</h1>
          <p className="mt-2 text-[13px] text-[#71717a]">
            The admin dashboard is only available to signed-in administrators.
          </p>
          <Link href="/login" className="mt-6 inline-flex rounded-lg bg-[#18181b] px-4 py-2 text-[13px] text-white">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f4f5] px-4">
        <div className="w-full max-w-md rounded-xl border border-[#e4e4e7] bg-white p-8 text-center">
          <h1 className="text-[22px] font-semibold">Admin access required</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[#71717a]">
            You are signed in as <span className="text-[#18181b]">{user.email}</span>, but this
            email is not on the administrator list.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/" className="rounded-lg border border-[#e4e4e7] px-4 py-2 text-[13px]">
              Back to site
            </Link>
            <Link href="/account" className="rounded-lg bg-[#18181b] px-4 py-2 text-[13px] text-white">
              My account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  const sidebar = (
    <>
      <div className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-[#e4e4e7] bg-white py-2 pl-9 pr-3 text-[13px] text-[#18181b] outline-none placeholder:text-[#a1a1aa] focus:border-[#a1a1aa]"
            aria-label="Search admin sections"
          />
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {filtered.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                active
                  ? 'bg-[#ececec] font-medium text-[#18181b]'
                  : 'text-[#3f3f46] hover:bg-[#f4f4f5] hover:text-[#18181b]'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              <span className="flex-1 truncate">{item.label}</span>
              {item.href === '/admin/tutors' && pendingTutors > 0 ? (
                <span className="rounded-md bg-[#fef3c7] px-1.5 py-0.5 text-[10px] font-medium text-[#b45309]">
                  {pendingTutors}
                </span>
              ) : item.badge ? (
                <span className="rounded-md bg-[#dbe7fb] px-1.5 py-0.5 text-[10px] font-medium text-[#2563eb]">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-[#a1a1aa]">No sections match.</p>
        ) : null}
      </nav>

      <div className="border-t border-[#e4e4e7] p-3 text-[11.5px]">
        <p className="truncate px-2 text-[#71717a]" title={user.email ?? ''}>
          {user.email}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[#3f3f46] transition-colors hover:bg-[#f4f4f5]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to site
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[#71717a] transition-colors hover:bg-[#f4f4f5] hover:text-[#18181b]"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f4f4f5] text-[#18181b]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e4e4e7] bg-white lg:flex">
        {sidebar}
      </aside>

      <div className="lg:pl-[248px]">
        <div className="sticky top-0 z-20 border-b border-[#e4e4e7] bg-white lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[14px] font-semibold">A-Level Hub admin</span>
            <Link href="/" className="flex items-center gap-1.5 text-[12px] text-[#71717a]">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12px] ${
                    active ? 'bg-[#ececec] font-medium' : 'text-[#52525b]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="mx-auto w-full max-w-[1420px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
