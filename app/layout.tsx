import type { Metadata, Viewport } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { PomodoroProvider } from '@/components/PomodoroProvider';
import { AnalyticsTracker } from '@/components/AnalyticsTracker';
import { I18nProvider } from '@/lib/i18n';

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Source_Serif_4({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'A-Level Hub — CIE past papers, AI and human tutors',
  description:
    'CIE AS & A Level past papers, an AI tutor grounded in your course material, and human tutors on demand — the whole syllabus broken into small, solvable pieces.',
  icons: {
    icon: `${basePath}/favicon.png`,
    apple: `${basePath}/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  themeColor: '#f7f2ea',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans">
        <I18nProvider>
          <AuthProvider>
            <PomodoroProvider>
              <AnalyticsTracker />
              {children}
            </PomodoroProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
