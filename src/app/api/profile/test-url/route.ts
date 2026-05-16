import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side reachability check for an admin-supplied `verifyBaseUrl`.
 *
 * Client cannot reliably probe arbitrary domains from the browser
 * because of CORS, so we proxy the request through the server. We fetch
 * `${verifyBaseUrl}/verify/test-token`:
 *  - 2xx / 3xx / 4xx all mean the domain *is* reachable (even 404 is
 *    acceptable because it proves DNS + TLS resolved and the host
 *    responded with HTTP).
 *  - Any network error means the domain cannot be reached or doesn't
 *    point at this app.
 *
 * The endpoint is admin-only because letting any user probe arbitrary
 * URLs from our backend is a small SSRF vector.
 */
const PROBE_TIMEOUT_MS = 5_000;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const raw = typeof body?.url === "string" ? body.url.trim() : "";
  if (!raw) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json(
      { error: "URL tidak valid (sertakan skema, misal https://)" },
      { status: 400 }
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "URL harus menggunakan http(s)" },
      { status: 400 }
    );
  }
  if (parsed.protocol === "http:") {
    // We still probe insecure URLs (some local deployments use http),
    // but surface a warning so admins see it.
  }

  const target = new URL(
    `${parsed.origin.replace(/\/$/, "")}${parsed.pathname.replace(/\/$/, "")}/verify/test-token`
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      // Identify ourselves so the operator can find these requests in
      // their access logs.
      headers: { "User-Agent": "DigitalSignature-VerifyBaseUrlProbe/1.0" },
    });
    const latencyMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      status: res.status,
      reachable: true,
      latencyMs,
      target: target.toString(),
      warning:
        parsed.protocol === "http:"
          ? "URL menggunakan HTTP. Disarankan menggunakan HTTPS."
          : undefined,
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = controller.signal.aborted;
    return NextResponse.json(
      {
        ok: false,
        reachable: false,
        latencyMs,
        target: target.toString(),
        error: timedOut
          ? `Timeout setelah ${PROBE_TIMEOUT_MS}ms`
          : message || "Tidak dapat menjangkau URL",
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
