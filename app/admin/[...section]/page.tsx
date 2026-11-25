import { Globe, Megaphone } from 'lucide-react';
import { notFound } from 'next/navigation';

const sections: Record<
  string,
  { title: string; description: string; icon: typeof Globe; note: string }
> = {
  marketing: {
    title: 'Marketing',
    description: 'Campaigns, referral links and newsletters are not part of this deployment.',
    icon: Megaphone,
    note: 'When you are ready, connect an email tool and add UTM-tagged links here.',
  },
  domains: {
    title: 'Domains',
    description: 'The site is served from GitHub Pages at timi114514.github.io/TiMi.github.io/.',
    icon: Globe,
    note: 'A custom domain can be attached in the GitHub repository Pages settings.',
  },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section: [section] }));
}

export default async function AdminPlaceholderPage({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const key = section?.[0] ?? '';
  const content = sections[key];
  if (!content) notFound();

  const Icon = content.icon;

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[32px]">
        {content.title}
      </h1>
      <p className="mt-1 text-[13px] text-[#71717a]">Part of the A-Level Hub admin shell.</p>

      <section className="mt-6 max-w-2xl rounded-xl border border-[#e4e4e7] bg-white p-8">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-[#e4e4e7] bg-[#fafafa]">
          <Icon className="h-5 w-5 text-[#52525b]" />
        </span>
        <h2 className="mt-4 text-[17px] font-semibold">{content.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#52525b]">{content.description}</p>
        <p className="mt-3 rounded-lg bg-[#f4f4f5] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#71717a]">
          {content.note}
        </p>
      </section>
    </div>
  );
}
