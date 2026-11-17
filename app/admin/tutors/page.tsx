'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, GraduationCap, Mail, Paperclip, UserRound, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

type TeacherApplication = {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  subjects: string | null;
  message: string | null;
  personal_statement: string | null;
  document_path: string | null;
  document_name: string | null;
  document_size: number | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

type HumanRequest = {
  id: string;
  email: string;
  subject: string;
  question: string;
  preferred_at: string | null;
  status: 'pending' | 'contacted' | 'closed';
  created_at: string;
};

const statusStyles: Record<string, string> = {
  pending: 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]',
  approved: 'border-[#cfe1d4] bg-[#eef5ef] text-[#3f7d5a]',
  rejected: 'border-[#e7c9c1] bg-[#fbeeea] text-[#8a3b2a]',
  contacted: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]',
  closed: 'border-[#e4e4e7] bg-[#fafafa] text-[#71717a]',
};

export default function AdminTutorsPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<TeacherApplication[] | null>(null);
  const [requests, setRequests] = useState<HumanRequest[] | null>(null);
  const [tab, setTab] = useState<'teachers' | 'requests'>('teachers');
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!supabase) return;
    const [apps, reqs] = await Promise.all([
      supabase
        .from('teacher_applications')
        .select(
          'id, user_id, email, display_name, subjects, message, personal_statement, document_path, document_name, document_size, status, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('human_tutor_requests')
        .select('id, email, subject, question, preferred_at, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (apps.error || reqs.error) {
      setMessage(apps.error?.message ?? reqs.error?.message ?? 'Failed to load tutor data.');
    }
    setApplications((apps.data as TeacherApplication[] | null) ?? []);
    setRequests((reqs.data as HumanRequest[] | null) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const sortedApplications = useMemo(() => {
    const rows = applications ?? [];
    return [...rows].sort((a, b) => {
      if (a.status === b.status) return b.created_at.localeCompare(a.created_at);
      return a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0;
    });
  }, [applications]);

  const sortedRequests = useMemo(() => {
    const rows = requests ?? [];
    return [...rows].sort((a, b) => {
      if (a.status === b.status) return b.created_at.localeCompare(a.created_at);
      return a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0;
    });
  }, [requests]);

  const pendingTeachers = (applications ?? []).filter((row) => row.status === 'pending').length;
  const pendingRequests = (requests ?? []).filter((row) => row.status === 'pending').length;

  async function reviewTeacher(row: TeacherApplication, status: 'approved' | 'rejected') {
    if (!supabase) return;
    const { error } = await supabase
      .from('teacher_applications')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id ?? null,
      })
      .eq('id', row.id);
    if (error) setMessage(error.message);
    else {
      setMessage(`${row.email} ${status === 'approved' ? 'approved' : 'rejected'}.`);
      await load();
    }
  }

  async function updateRequest(row: HumanRequest, status: 'contacted' | 'closed') {
    if (!supabase) return;
    const { error } = await supabase
      .from('human_tutor_requests')
      .update({ status })
      .eq('id', row.id);
    if (error) setMessage(error.message);
    else await load();
  }

  async function openDocument(path: string) {
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from('teacher-documents')
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? 'Could not open the attachment.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Tutors</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Review teacher applications and human tutor session requests.
      </p>

      <div className="mt-4 flex gap-4 border-b border-[#e4e4e7] text-[13px]">
        <button
          type="button"
          onClick={() => setTab('teachers')}
          className={`-mb-px border-b-2 pb-2.5 ${
            tab === 'teachers'
              ? 'border-[#18181b] font-medium text-[#18181b]'
              : 'border-transparent text-[#71717a]'
          }`}
        >
          Teacher applications
          {pendingTeachers > 0 ? (
            <span className="ml-1.5 rounded-full bg-[#fffbeb] px-1.5 py-0.5 text-[10.5px] text-[#b45309]">
              {pendingTeachers}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={`-mb-px border-b-2 pb-2.5 ${
            tab === 'requests'
              ? 'border-[#18181b] font-medium text-[#18181b]'
              : 'border-transparent text-[#71717a]'
          }`}
        >
          Human tutor requests
          {pendingRequests > 0 ? (
            <span className="ml-1.5 rounded-full bg-[#fffbeb] px-1.5 py-0.5 text-[10.5px] text-[#b45309]">
              {pendingRequests}
            </span>
          ) : null}
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-[#e4e4e7] bg-white px-4 py-2 text-[12px] text-[#52525b]">
          {message}
        </p>
      ) : null}

      {tab === 'teachers' ? (
        <div className="mt-4 space-y-3">
          {applications === null ? (
            <div className="h-28 animate-pulse rounded-xl bg-[#e4e4e7]/60" />
          ) : sortedApplications.length === 0 ? (
            <div className="rounded-xl border border-[#e4e4e7] bg-white px-5 py-12 text-center text-[12.5px] text-[#a1a1aa]">
              No teacher applications yet. Students can apply from the sign-up form.
            </div>
          ) : (
            sortedApplications.map((row) => (
              <article key={row.id} className="rounded-xl border border-[#e4e4e7] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
                      <GraduationCap className="h-4 w-4 text-[#52525b]" />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-medium">
                        {row.display_name || row.email}
                        <span className="ml-2 text-[11.5px] font-normal text-[#71717a]">
                          {row.email}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[#71717a]">
                        {row.subjects || 'Subjects not specified'} · applied{' '}
                        {new Date(row.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] capitalize ${
                      statusStyles[row.status]
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                {row.personal_statement || row.message ? (
                  <p className="mt-3 whitespace-pre-wrap rounded-lg bg-[#fafafa] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#52525b]">
                    {row.personal_statement || row.message}
                  </p>
                ) : null}

                {row.document_path ? (
                  <button
                    type="button"
                    onClick={() => void openDocument(row.document_path!)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-3 py-1.5 text-[11.5px] text-[#3f3f46] transition-colors hover:bg-[#fafafa]"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {row.document_name || 'Attachment'}
                    {row.document_size ? (
                      <span className="text-[#a1a1aa]">
                        · {(row.document_size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    ) : null}
                  </button>
                ) : null}

                {row.status === 'pending' ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void reviewTeacher(row, 'approved')}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#18181b] px-3 py-1.5 text-[11.5px] text-white"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewTeacher(row, 'rejected')}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#e4e4e7] px-3 py-1.5 text-[11.5px] text-[#b91c1c]"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {requests === null ? (
            <div className="h-28 animate-pulse rounded-xl bg-[#e4e4e7]/60" />
          ) : sortedRequests.length === 0 ? (
            <div className="rounded-xl border border-[#e4e4e7] bg-white px-5 py-12 text-center text-[12.5px] text-[#a1a1aa]">
              No human tutor requests yet. Students can submit one from the human tutor page.
            </div>
          ) : (
            sortedRequests.map((row) => (
              <article key={row.id} className="rounded-xl border border-[#e4e4e7] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
                      <UserRound className="h-4 w-4 text-[#52525b]" />
                    </span>
                    <div>
                      <p className="text-[13.5px] font-medium">{row.subject}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#71717a]">
                        <Mail className="h-3 w-3" /> {row.email} ·{' '}
                        {new Date(row.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] capitalize ${
                      statusStyles[row.status]
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-[#fafafa] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#52525b]">
                  {row.question}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-[#a1a1aa]">
                    {row.preferred_at
                      ? `Preferred ${new Date(row.preferred_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'No preferred time'}
                  </p>
                  {row.status !== 'closed' ? (
                    <div className="flex gap-2">
                      {row.status === 'pending' ? (
                        <button
                          type="button"
                          onClick={() => void updateRequest(row, 'contacted')}
                          className="rounded-lg bg-[#18181b] px-3 py-1.5 text-[11.5px] text-white"
                        >
                          Mark contacted
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void updateRequest(row, 'closed')}
                        className="rounded-lg border border-[#e4e4e7] px-3 py-1.5 text-[11.5px] text-[#52525b]"
                      >
                        Close
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
