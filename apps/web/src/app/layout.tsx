import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/header';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'AegisOps AI | SRE & Incident Management Platform',
  description:
    'Production-grade Site Reliability Engineering, topological alert correlation, evidence-grounded AI root cause analysis, and automated postmortems.',
  keywords: [
    'SRE',
    'Incident Management',
    'Observability',
    'OpenTelemetry',
    'AI RCA',
    'Site Reliability Engineering',
    'DevOps',
  ],
  authors: [{ name: 'Zeeshan Sajid' }],
  openGraph: {
    title: 'AegisOps AI | SRE & Incident Management Platform',
    description:
      'AI-Powered Incident Management, Observability & Site Reliability Engineering Platform',
    type: 'website',
    locale: 'en_US',
    siteName: 'AegisOps AI',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AegisOps AI',
    description:
      'AI-Powered Incident Management, Observability & Site Reliability Engineering Platform',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        <Providers>
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500 font-mono">
            AegisOps AI • Real-Time Incident Management & Site Reliability Engineering
          </footer>
        </Providers>
      </body>
    </html>
  );
}
