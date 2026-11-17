import type { Metadata, Viewport } from 'next';
import { Inter, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { PomodoroProvider } from '@/components/PomodoroProvider';
import { AnalyticsTracker } from '@/components/AnalyticsTracker';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'Differential Quant — Past papers, AI and human tutors',
  description:
    'Past papers plus an AI tutor grounded in your course material and human tutors on demand — with the sources shown.',
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
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans">
        <AuthProvider>
          <PomodoroProvider>
            <AnalyticsTracker />
            {children}
          </PomodoroProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
