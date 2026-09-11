'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client exception for diagnostics
    // eslint-disable-next-line no-console
    console.error('Unhandled Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-md p-8 rounded-2xl border border-rose-900/50 bg-slate-900/90 shadow-2xl space-y-6 backdrop-blur-sm">
        <div className="h-14 w-14 rounded-full bg-rose-950/80 border border-rose-800 flex items-center justify-center mx-auto text-rose-400">
          <AlertOctagon className="h-7 w-7 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">
            Operational View Error
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            An unexpected error occurred while rendering this interface. Core telemetry, alerts, and incident automation continue running uninterrupted on the server.
          </p>
        </div>

        {error.message && (
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-left">
            <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">Error Diagnostic</span>
            <code className="text-xs font-mono text-rose-300 break-words line-clamp-3">
              {error.message}
            </code>
            {error.digest && (
              <span className="text-[10px] text-slate-500 font-mono block mt-1">Digest: {error.digest}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-indigo-500/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-2 transition-colors border border-slate-700"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Overview</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

