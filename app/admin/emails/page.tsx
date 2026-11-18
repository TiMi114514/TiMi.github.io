'use client';

import { useEffect, useMemo, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { CopyButton } from '@/components/admin/CopyButton';
import { supabase } from '@/lib/supabase';

type Application = {
  id: number;
  email: string;
  display_name: string | null;
  subjects: string | null;
};

type RequestRow = {
  id: number;
  email: string;
  subject: string;
};

type EmailEvent = {
  id: number;
  kind: string;
  recipient: string | null;
  applicant_email: string | null;
  subject: string | null;
  status: string;
  created_at: string;
};

const templates = [
  {
    id: 'approved',
    label: 'Teacher approved',
    subject: 'Your A-Level Hub tutor application',
    body: (name: string) =>
      `Hi ${name || 'there'},\n\nThank you for applying to tutor with A-Level Hub. Your application has been approved.\n\nYou can now sign in with this email address and open the Human tutor area. We will contact you when a student requests a session in your subjects.\n\nBest,\nA-Level Hub`,
  },
  {
    id: 'rejected',
    label: 'Teacher not accepted',
    subject: 'Your A-Level Hub tutor application',
    body: (name: string) =>
      `Hi ${name || 'there'},\n\nThank you for taking the time to apply to tutor with A-Level Hub. We are not able to approve your application at this time.\n\nYou are still welcome to use the archive and the AI tutor with this account.\n\nBest,\nA-Level Hub`,
  },
  {
    id: 'request',
    label: 'Human tutor reply',
    subject: 'Your A-Level Hub tutor request',
    body: (name: string) =>
      `Hi ${name || 'there'},\n\nThanks for your tutor request. I have read the question you sent and can help with it.\n\nWhen would be a good time for a short session? Reply with two or three times that work for you and I will confirm one.\n\nBest,\nA-Level Hub`,
  },
  {
    id: 'verify',
    label: 'Verification reminder',
    subject: 'Please verify your A-Level Hub email',
    body: (name: string) =>
      `Hi ${name || 'there'},\n\nYour A-Level Hub account is almost ready. Please open the verification email and confirm this address so the AI tutor unlocks.\n\nIf the link has expired, sign in and request a new verification email.\n\nBest,\nA-Level Hub`,
  },
] as const;

export default function AdminEmailsPage() {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [events, setEvents] = useState<EmailEvent[] | null>(null);
  const [templateId, setTemplateId] = useState<(typeof templates)[number]['id']>('approved');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function load() {
      const [apps, reqs, log] = await Promise.all([
        supabase!
          .from('teacher_applications')
          .select('id, email, display_name, subjects')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase!
          .from('human_tutor_requests')
          .select('id, email, subject')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase!
          .from('email_events')
          .select('id, kind, recipient, applicant_email, subject, status, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (!active) return;
      if (apps.error || reqs.error || log.error) {
        setError(apps.error?.message ?? reqs.error?.message ?? log.error?.message ?? 'Failed to load emails.');
      }
      setApplications((apps.data as Application[] | null) ?? []);
      setRequests((reqs.data as RequestRow[] | null) ?? []);
      setEvents((log.data as EmailEvent[] | null) ?? []);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const recipients = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of applications ?? []) {
      map.set(app.email, app.display_name ? `${app.display_name} · ${app.email}` : app.email);
    }
    for (const request of requests ?? []) {
      if (!map.has(request.email)) map.set(request.email, request.email);
    }
    return Array.from(map.entries()).map(([email, label]) => ({ email, label }));
  }, [applications, requests]);

  const template = templates.find((item) => item.id === templateId) ?? templates[0];
  const activeRecipient = recipient || recipients[0]?.email || '';
  const name =
    applications?.find((app) => app.email === activeRecipient)?.display_name ?? '';
  const body = template.body(name);
  const mailto = `mailto:${activeRecipient}?subject=${encodeURIComponent(
    template.subject,
  )}&body=${encodeURIComponent(body)}`;

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">Emails</h1>
      <p className="mt-1 text-[13px] text-[#71717a]">
        Compose tutor replies and review teacher-application forwarding.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[12.5px] text-[#b91c1c]">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e4e4e7] px-5 py-3.5">
            <Mail className="h-4 w-4 text-[#71717a]" />
            <h2 className="text-[14px] font-semibold">Compose</h2>
          </div>
          <div className="space-y-3 p-5">
            <label className="block text-[11.5px] text-[#71717a]">
              Template
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value as typeof templateId)}
                className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12.5px] text-[#18181b] outline-none"
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[11.5px] text-[#71717a]">
              Recipient
              <select
                value={activeRecipient}
                onChange={(event) => setRecipient(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-white px-3 py-2 text-[12.5px] text-[#18181b] outline-none"
              >
                {recipients.length === 0 ? <option value="">No pending applicants</option> : null}
                {recipients.map((item) => (
                  <option key={item.email} value={item.email}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-[11.5px] text-[#71717a]">Subject</p>
              <p className="mt-1 rounded-lg bg-[#fafafa] px-3 py-2 text-[12px]">
                {template.subject}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] text-[#71717a]">Body</p>
                <CopyButton text={`Subject: ${template.subject}\n\n${body}`} />
              </div>
              <pre className="mt-1 max-h-[260px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#fafafa] px-3 py-2 text-[11.5px] leading-relaxed text-[#3f3f46]">
                {body}
              </pre>
            </div>

            <a
              href={mailto}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium text-white ${
                activeRecipient ? 'bg-[#18181b]' : 'pointer-events-none bg-[#a1a1aa]'
              }`}
            >
              <Send className="h-3.5 w-3.5" /> Open in mail app
            </a>
          </div>
        </section>

        <section className="rounded-xl border border-[#e4e4e7] bg-white">
          <div className="border-b border-[#e4e4e7] px-5 py-3.5">
            <h2 className="text-[14px] font-semibold">Delivery status</h2>
          </div>
          <div className="space-y-3 p-5 text-[12px] leading-relaxed text-[#52525b]">
            <p>
              Teacher applications are forwarded through FormSubmit to the owner inbox. The copy
              stays in <strong>Tutors</strong>, even if the email provider rejects it.
            </p>
            <p>
              Supabase&apos;s built-in auth email sender is rate-limited. Add custom SMTP in
              Supabase before relying on verification or reset emails at scale.
            </p>
            <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11.5px] text-[#92400e]">
              This page creates <code>mailto:</code> links; it does not send mail from the browser.
              Review the draft before sending.
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#e4e4e7] bg-white">
        <div className="flex items-center justify-between border-b border-[#e4e4e7] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">Forwarding log</h2>
          <span className="text-[11px] text-[#a1a1aa]">{events?.length ?? 0} events</span>
        </div>
        {events === null ? (
          <p className="px-5 py-8 text-center text-[12px] text-[#a1a1aa]">Loading…</p>
        ) : events.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12px] text-[#a1a1aa]">
            No teacher application emails have been submitted yet.
          </p>
        ) : (
          <div className="divide-y divide-[#f0f0f1]">
            {events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">
                    {event.subject || event.kind}
                  </p>
                  <p className="truncate text-[10.5px] text-[#a1a1aa]">
                    {event.applicant_email || event.recipient} · {event.status}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-[#a1a1aa]">
                  {new Date(event.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
