/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure the bundled stamp fonts ship with the serverless functions
  // that render PNG stamps (QR + signature visualization). Next.js
  // tracing follows literal fs.readFileSync paths reasonably well, but
  // we build the path with path.join(process.cwd(), …) so we list the
  // assets explicitly to be safe across Vercel runtime versions.
  outputFileTracingIncludes: {
    "/api/archives/[id]/stamp": ["./public/fonts/**"],
    "/api/archives/[id]/qr": ["./public/fonts/**"],
    "/api/archives/[id]/embed-pdf": ["./public/fonts/**"],
  },
  images: {
    // The dashboard now serves the org logo as an uploaded file via
    // /api/profile/logo, but the legacy `logoUrl` (external image) is
    // still rendered for backwards compatibility on a plain <img>. The
    // optimizer is not used for that source — we keep this list tight so
    // any future <Image> use can't be tricked into fetching arbitrary
    // hosts over plain HTTP.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Apply baseline security headers globally. Tuned so the public verify
  // page is the most locked-down surface (DENY framing), while the rest
  // of the app keeps reasonable defaults.
  async headers() {
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
    ];
    return [
      // /verify/* is the trust anchor — never let it be framed.
      {
        source: "/verify/:path*",
        headers: [
          ...baseline,
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      // The dashboard is an internal admin tool; keep it out of search
      // engines and out of frames on third-party sites.
      {
        source: "/dashboard/:path*",
        headers: [
          ...baseline,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Everything else (public landing, /about, /login, /api/*).
      {
        source: "/:path*",
        headers: [
          ...baseline,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
