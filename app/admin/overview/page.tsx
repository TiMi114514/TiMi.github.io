'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Database,
  Download,
  FileText,
  GraduationCap,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/analytics';

type DownloadRow = { key: string; title: string | null; created_at: string };

export default function AdminOverviewPage() {
  const [visits, setVisits] = useState<number | null>(null);
  const [users, setUsers] = useState<number | null>(null);
  const [papers, setPapers] = useState<number | null>(null);
  const [downloads, setDownloads] = useState<DownloadRow[]>([]);
  const [downloadCount, setDownloadCount] = useState<number | null>(null);
  const [downloads30d, setDownloads30d] = useState<number | null>(null);
  const [liveLearners, setLiveLearners] = useState<number | null>(null);
  const [pendingTutors, setPendingTutors] = useState<number | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load() {
      const [
        analytics,
        userList,
        paperCount,
        downloadCountResult,
        eventCountResult,
        signedRecent,
        guestRecent,
        homeStats,
        teacherPending,
        requestPending,
      ] = await Promise.all([
        supabase!.rpc('admin_analytics', { p_days: 7 }),
        supabase!.rpc('admin_list_users'),
        supabase!.from('papers').select('id', { count: 'exact', head: true }),
        supabase!.from('downloads').select('id', { count: 'exact', head: true }),
        supabase!.from('download_events').select('id', { count: 'exact', head: true }),
        supabase!
          .from('downloads')
          .select('id, paper_title, created_at')
          .order('created_at', { ascending: false })
          .limit(6),
        supabase!
          .from('download_events')
          .select('id, file_name, created_at')
          .order('created_at', { ascending: false })
          .limit(6),
        supabase!.rpc('home_stats'),
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
      const signedRows = ((signedRecent.data as {
        id: number;
        paper_title: string | null;
        created_at: string;
      }[]) ?? []).map((row) => ({
        key: `account-${row.id}`,
        title: row.paper_title,
        created_at: row.created_at,
      }));
      const guestRows = ((guestRecent.data as {
        id: number;
        file_name: string | null;
        created_at: string;
      }[]) ?? []).map((row) => ({
        key: `guest-${row.id}`,
        title: row.file_name,
        created_at: row.created_at,
      }));
      setVisits(Number(analytics.data?.total_visits ?? 0));
      setUsers(Array.isArray(userList.data) ? userList.data.length : 0);
      setPapers(paperCount.count ?? 0);
      setDownloadCount((downloadCountResult.count ?? 0) + (eventCountResult.count ?? 0));
      setDownloads(
        [...signedRows, ...guestRows]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 6),
      );
      setDownloads30d(Number(homeStats.data?.download_files ?? 0));
      setLiveLearners(Number(homeStats.data?.live_learners ?? 0));
      setPendingTutors((teacherPending.count ?? 0) + (requestPending.count ?? 0));
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const cards = [
    { label: 'Visits, last 7 days', value: visits, href: '/admin', icon: ArrowUpRight },
    { label: 'Registered users', value: users, href: '/admin/users', icon: Users },
    { label: 'Downloads, last 30 days', value: downloads30d, href: '/admin?tab=downloads', icon: Download },
    { label: 'Pending tutor reviews', value: pendingTutors, href: '/admin/tutors', icon: GraduationCap },
    { label: 'Learners online now', value: liveLearners, href: '/admin', icon: Activity },
    { label: 'Papers in archive', value: papers, href: '/admin/data', icon: Database },
    { label: 'Downloads logged (all time)', value: downloadCount, href: '/admin/logs', icon: FileText },
  ];

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Overview</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        A quick summary of traffic, accounts and the archive.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-xl border border-[#e4e4e7] bg-white p-5 transition-colors hover:border-[#d4d4d8]"
          >
            <div className="flex items-center justify-between text-[12px] text-[#71717a]">
              <span>{card.label}</span>
              <card.icon className="h-4 w-4 text-[#a1a1aa]" />
            </div>
            <p className="mt-3 text-[26px] font-semibold leading-none">
              {card.value === null ? '—' : formatNumber(card.value)}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
              <Download className="h-4 w-4 text-[#71717a]" /> Recent downloads
            </h2>
            <Link href="/admin/logs" className="text-[12px] text-[#71717a] hover:text-[#18181b]">
              View logs
            </Link>
          </div>
          <div className="divide-y divide-[#f0f0f1]">
            {downloads.length === 0 ? (
              <p className="px-5 py-8 text-center text-[12.5px] text-[#a1a1aa]">
                No downloads recorded yet.
              </p>
            ) : (
              downloads.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 px-5 py-3">
                  <span className="truncate text-[13px]">{row.title || 'Past paper'}</span>
                  <span className="shrink-0 text-[11.5px] text-[#a1a1aa]">
                    {new Date(row.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold">
            <FileText className="h-4 w-4 text-[#71717a]" /> What to do next
          </h2>
          <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-[#52525b]">
            <li>• Invite another administrator under Settings.</li>
            <li>• Publish or remove papers under Data.</li>
            <li>• Point the site at a public RAGFlow URL when it is available.</li>
            <li>• Add custom SMTP in Supabase so verification emails arrive reliably.</li>
          </ul>
          <Link
            href="/admin/analytics"
            className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#18181b] underline decoration-[#d4d4d8] underline-offset-4"
          >
            Open analytics <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}
