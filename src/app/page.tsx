import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateOrganizationProfile } from "@/lib/profile";
import { LogoMark } from "@/components/LogoMark";
import { Button } from "@/components/ui/Button";

export default async function HomePage() {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }
  const profile = await getOrCreateOrganizationProfile();

  return (
    <main className="min-h-screen">
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: `linear-gradient(135deg, ${profile.primaryColor}, #0b1220)`,
        }}
      >
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
          <div className="flex items-center gap-4">
            <LogoMark
              profile={profile}
              size={56}
              className="bg-white p-1"
              fallbackBg="rgba(255,255,255,0.15)"
            />
            <div>
              <p className="text-sm uppercase tracking-wide opacity-80">
                {profile.shortName || "Digital Signature"}
              </p>
              <h1 className="text-xl font-semibold">{profile.name}</h1>
            </div>
          </div>

          <h2 className="mt-10 max-w-2xl text-balance text-3xl font-bold leading-tight sm:mt-12 sm:text-4xl">
            Tanda tangani dokumen secara digital,{" "}
            <span className="opacity-80">verifikasi publik secara terbuka.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-white/85">
            {profile.tagline ||
              "Terbitkan dokumen dengan atestasi tamper-evident. Setiap dokumen yang ditandatangani mendapat QR code unik yang mengarah ke halaman verifikasi publik di domain resmi organisasi Anda."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Masuk ke dashboard
              </Button>
            </Link>
            <Link href="/about">
              <Button size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                Tentang sistem
              </Button>
            </Link>
            <Link href="#how-it-works">
              <Button size="lg" variant="ghost" className="text-white hover:bg-white/10">
                Cara kerja
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16"
      >
        <h3 className="text-2xl font-semibold">Cara kerja verifikasi</h3>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <Step
            n="1"
            title="Terbitkan & tanda tangani"
            body="Admin terotorisasi memilih signatory dan menandatangani dokumen yang sudah diarsipkan. Sistem menyimpan atestasi tamper-evident dengan integritas HMAC."
          />
          <Step
            n="2"
            title="Tempel QR"
            body="QR code dibuat untuk dokumen tersebut, mengarah ke URL verifikasi resmi organisasi Anda dengan identitas brand sendiri."
          />
          <Step
            n="3"
            title="Verifikasi publik"
            body="Siapapun yang memindai QR akan diarahkan ke halaman publik di domain Anda yang mengonfirmasi validitas, identitas signatory, dan detail dokumen."
          />
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} {profile.name} — platform digital
        signature open-source.
      </footer>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--brand)" }}
      >
        {n}
      </div>
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}
