import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { AnalyticsTracker } from '@/components/AnalyticsTracker';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Paperwise — Every past paper. Every question answered.',
  description:
    'One archive for past papers, plus an AI tutor grounded in your course material, with the sources shown.',
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/favicon.svg`,
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
          <AnalyticsTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
