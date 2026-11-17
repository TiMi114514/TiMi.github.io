export type TeacherApplicationEmail = {
  email: string;
  name: string;
  subjects: string;
  statement: string;
  file: File | null;
};

/**
 * Forward the application to the owner's inbox with the attachment.
 *
 * Static hosting has no mail server, so this posts a multipart form to
 * FormSubmit in a hidden iframe. The first submission sends a one-time
 * activation link to the owner; after that, applications arrive by email.
 * The Supabase record and private document remain the source of truth.
 */
export function forwardTeacherApplication(payload: TeacherApplicationEmail): void {
  if (typeof document === 'undefined') return;

  try {
    let frame = document.querySelector<HTMLIFrameElement>('iframe[name="dq-application-mail"]');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.name = 'dq-application-mail';
      frame.style.display = 'none';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);
    }

    const form = document.createElement('form');
    form.action = 'https://formsubmit.co/jackychen2027@outlook.com';
    form.method = 'POST';
    form.enctype = 'multipart/form-data';
    form.target = frame.name;
    form.style.display = 'none';
    form.acceptCharset = 'UTF-8';

    const add = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    add('name', payload.name || 'Applicant');
    add('email', payload.email);
    add('_replyto', payload.email);
    add('_subject', `New teacher application — ${payload.name || payload.email}`);
    add('_template', 'table');
    add('_captcha', 'false');
    add('Applicant email', payload.email);
    add('Subjects', payload.subjects || 'Not specified');
    add('Personal statement', payload.statement || 'Not provided');

    if (payload.file) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.name = 'attachment';
      try {
        const transfer = new DataTransfer();
        transfer.items.add(payload.file);
        fileInput.files = transfer.files;
      } catch {
        /* some browsers block programmatic file assignment */
      }
      form.appendChild(fileInput);
    }

    document.body.appendChild(form);
    form.submit();

    window.setTimeout(() => {
      form.remove();
    }, 15_000);
  } catch {
    /* email forwarding is best-effort; the Supabase record still exists */
  }
}
