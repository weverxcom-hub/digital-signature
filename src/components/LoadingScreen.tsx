"use client";

import { useState } from "react";

/**
 * Branded full-page loading state.
 *
 * Kept as a pure client component (no DB calls!) so it doesn't drag Prisma
 * into static prerender paths like /_not-found. The logo image is loaded
 * from /api/profile/logo which falls back gracefully to a generic shield
 * icon when no logo has been uploaded — but the browser has almost
 * certainly cached the response from a previous page load, so the
 * transition feels seamless.
 */
export function LoadingScreen({
  label = "Memuat…",
}: {
  label?: string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <span
          aria-hidden
          className="absolute inset-0 -m-3 animate-ping rounded-full bg-[var(--brand,#0f766e)] opacity-25"
        />
        <span className="relative inline-flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-md bg-white p-2 shadow-md ring-1 ring-slate-200">
          {imgError ? (
            // Generic shield icon so the animation reads as "loading
            // verified document" even when no org logo is configured
            // yet. Stroke-only SVG keeps the silhouette legible inside
            // the white card.
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width={40}
              height={40}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--brand,#0f766e)]"
            >
              <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/profile/logo"
              alt=""
              width={56}
              height={56}
              className="max-h-full max-w-full object-contain"
              onError={() => setImgError(true)}
            />
          )}
        </span>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
