'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/components/AuthProvider';
import { forwardTeacherApplication } from '@/lib/teacher-email';
import { appUrl, supabase } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [applyTeacher, setApplyTeacher] = useState(false);
  const [teacherSubjects, setTeacherSubjects] = useState('');
  const [teacherMessage, setTeacherMessage] = useState('');
  const [teacherFile, setTeacherFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (!file) {
      setTeacherFile(null);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('The attachment must be 10 MB or smaller.');
      event.target.value = '';
      setTeacherFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Attach a JPG, PNG, WebP, PDF, DOC or DOCX file.');
      event.target.value = '';
      setTeacherFile(null);
      return;
    }
    setTeacherFile(file);
  }

  useEffect(() => {
    if (!loading && user) router.replace('/account');
  }, [loading, user, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured for this deployment yet.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: appUrl('/auth/callback'),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    if (applyTeacher) {
      let documentPath: string | null = null;
      if (teacherFile) {
        const safeName = teacherFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${data.user?.id ?? 'anon'}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('teacher-documents')
          .upload(path, teacherFile, { contentType: teacherFile.type, upsert: false });
        if (!uploadError) documentPath = path;
      }

      await supabase
        .from('teacher_applications')
        .insert({
          user_id: data.user?.id ?? null,
          email: email.trim(),
          display_name: name.trim() || null,
          subjects: teacherSubjects.trim() || null,
          message: teacherMessage.trim() || null,
          personal_statement: teacherMessage.trim() || null,
          document_path: documentPath,
          document_name: teacherFile?.name ?? null,
          document_size: teacherFile?.size ?? null,
          document_type: teacherFile?.type ?? null,
          status: 'pending',
        })
        .then(() => undefined, () => undefined);

      forwardTeacherApplication({
        email: email.trim(),
        name: name.trim(),
        subjects: teacherSubjects.trim(),
        statement: teacherMessage.trim(),
        file: teacherFile,
      });

      void supabase.from('email_events').insert({
        kind: 'teacher_application',
        recipient: 'jackychen2027@outlook.com',
        applicant_email: email.trim(),
        subject: 'New teacher application',
        status: 'submitted',
      });
    }

    window.sessionStorage.setItem('paperwise.pendingEmail', email.trim());

    if (data.session) {
      router.replace('/account');
    } else {
      router.replace('/verify');
    }
  }

  return (
    <div>
      <Header />
      <main className="container-page flex min-h-[calc(100vh-72px)] items-start justify-center py-16">
        <div className="w-full max-w-[440px]">
          <p className="eyebrow">Create account</p>
          <h1 className="mt-3 font-display text-[42px] leading-none tracking-[-0.01em]">
            Start with the archive
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            Free to browse. One email check unlocks downloads and both tutors.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Name</span>
              <input
                required
                autoComplete="name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label className="block space-y-1.5 text-[12.5px] text-muted">
              <span>Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper/60 px-3.5 py-3 transition-colors hover:bg-paper">
              <input
                type="checkbox"
                checked={applyTeacher}
                onChange={(event) => setApplyTeacher(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-ink"
              />
              <span>
                <span className="block text-[13px] text-ink">Apply to become a teacher</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
                  Optional — reviewed by the Differential Quant team. Approved teachers can take
                  human tutor sessions.
                </span>
              </span>
            </label>

            {applyTeacher ? (
              <div className="animate-fade-up space-y-3 rounded-xl border border-line bg-paper/60 p-3.5">
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>Subjects you teach</span>
                  <input
                    className="input"
                    value={teacherSubjects}
                    onChange={(event) => setTeacherSubjects(event.target.value)}
                    placeholder="Mathematics, Physics…"
                  />
                </label>
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>Personal statement</span>
                  <textarea
                    rows={4}
                    className="input resize-y"
                    value={teacherMessage}
                    onChange={(event) => setTeacherMessage(event.target.value)}
                    placeholder="Qualifications, exam boards, teaching experience, why you want to tutor…"
                  />
                </label>
                <label className="block space-y-1.5 text-[12.5px] text-muted">
                  <span>Photo or document (optional, max 10 MB)</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                    onChange={chooseFile}
                    className="block w-full cursor-pointer rounded-xl border border-line bg-white/80 px-3 py-2 text-[12px] text-muted file:mr-3 file:rounded-full file:border-0 file:bg-soft file:px-3 file:py-1.5 file:text-[11.5px] file:text-ink"
                  />
                  <span className="block text-[10.5px] text-muted/80">
                    JPG, PNG, WebP, PDF, DOC or DOCX. Used only to review your application.
                  </span>
                </label>
                {teacherFile ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white/70 px-3 py-2 text-[11.5px]">
                    <span className="min-w-0 truncate text-ink">{teacherFile.name}</span>
                    <span className="shrink-0 text-muted">
                      {(teacherFile.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => setTeacherFile(null)}
                      className="shrink-0 text-muted underline decoration-line underline-offset-2 hover:text-ink"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="rounded-xl border border-[#e7c9c1] bg-[#fbeeea] px-3 py-2 text-[12.5px] leading-relaxed text-[#8a3b2a]">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn-dark w-full py-3">
              {busy ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-center text-[11.5px] leading-relaxed text-muted">
              We&apos;ll email you a link to verify your address before the archive is unlocked.
            </p>
          </form>

          <p className="mt-6 text-[13px] text-muted">
            Already have an account?{' '}
            <Link href="/login" className="link-underline text-ink">
              Sign in
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
