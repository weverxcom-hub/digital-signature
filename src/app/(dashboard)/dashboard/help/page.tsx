import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getOrCreateOrganizationProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const profile = await getOrCreateOrganizationProfile();
  const verifyHost = profile.verifyBaseUrl?.replace(/^https?:\/\//, "") ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Panduan</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cara kerja sistem tanda tangan elektronik dan langkah-langkah
          menerbitkan dokumen ber-QR.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alur singkat</CardTitle>
          <CardDescription>
            Ringkasan flow dari penerbitan dokumen sampai verifikasi publik.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="ml-4 list-decimal space-y-2 text-sm text-slate-700">
            <li>
              Admin <strong>setup organisasi</strong> sekali di awal
              (<Link className="underline" href="/dashboard/profile">Organization Profile</Link>):
              logo, brand color, dan <code>verifyBaseUrl</code> (domain resmi
              instansi).
            </li>
            <li>
              Admin <strong>mendaftarkan penandatangan</strong>{" "}
              (<Link className="underline" href="/dashboard/signatories">Signatories</Link>) — Rektor,
              Dekan, Wakil Rektor, dll.
            </li>
            <li>
              Saat akan menerbitkan surat, admin{" "}
              <strong>membuat archive baru</strong>{" "}
              (<Link className="underline" href="/dashboard/archives">Archives</Link>) dengan input:
              nomor surat, perihal, tanggal terbit, deskripsi opsional.
            </li>
            <li>
              Admin <strong>menandatangani archive</strong> — pilih signatory,
              klik <em>Sign archive</em>. Sistem menghasilkan token unik dan
              HMAC-SHA256 yang mengunci semua metadata.
            </li>
            <li>
              Admin <strong>mengunduh visualisasi tanda tangan</strong> (PNG)
              dan menempelkannya ke versi final PDF/Word surat di tempat
              tanda tangan basah biasanya berada.
            </li>
            <li>
              Surat dikirim ke penerima. Saat <strong>QR dipindai</strong>,
              browser membuka halaman publik di domain resmi yang
              menampilkan: status verifikasi, nomor surat, perihal, nama,
              jabatan, tanggal-jam ditandatangani.
            </li>
            <li>
              Bila kemudian surat perlu dibatalkan, admin (super-admin) bisa{" "}
              <strong>mencabut tanda tangan</strong> dari halaman detail
              archive. Pemindaian QR berikutnya akan menampilkan status{" "}
              <em>Signature revoked</em>.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Konfigurasi organisasi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            Buka <Link className="underline" href="/dashboard/profile">Organization Profile</Link>{" "}
            dan isi:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Name</strong> — nama lengkap instansi (mis. <em>Universitas Gajayana Malang</em>).</li>
            <li><strong>Short name</strong> — singkatan (mis. <em>UNIGA</em>) untuk header dashboard.</li>
            <li><strong>Logo URL</strong> — link langsung ke file PNG/SVG logo (di-host di mana saja yang publik).</li>
            <li><strong>Primary color</strong> — warna brand untuk header verifikasi.</li>
            <li>
              <strong>Verify base URL</strong> — domain resmi tempat QR akan
              mengarah. Idealnya sama dengan domain instansi:{" "}
              <code>https://unigamalang.ac.id</code> atau subdomain seperti{" "}
              <code>https://tte.unigamalang.ac.id</code>. Ini adalah kunci
              kepercayaan: orang yang scan QR akan langsung lihat domain
              resmi instansi di address bar.
            </li>
            <li><strong>Website</strong> — alamat web instansi (tampil di footer halaman verifikasi).</li>
          </ul>
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <strong>Penting:</strong> setelah ganti <code>verifyBaseUrl</code>,
            pastikan domain itu sudah meneruskan path <code>/verify/&lt;token&gt;</code>{" "}
            ke aplikasi ini (lihat bagian &quot;Setup domain&quot; di bawah).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2 — Daftarkan penandatangan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            Di <Link className="underline" href="/dashboard/signatories">Signatories</Link>, tekan{" "}
            <em>Add signatory</em> dan isi:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Name</strong> — nama lengkap dengan gelar (mis. <em>Prof. Dr. Ir. Sutopo, M.Si</em>).</li>
            <li><strong>Position</strong> — jabatan yang ditampilkan di QR (mis. <em>Rektor</em>).</li>
            <li><strong>Unit</strong> — opsional, mis. <em>Universitas Gajayana Malang</em>.</li>
            <li><strong>NIP</strong> — opsional, hanya untuk catatan internal (tidak ditampilkan publik).</li>
          </ul>
          <p>
            Saat signatory dihapus, sistem hanya menandainya sebagai non-aktif
            (soft delete). Tanda tangan yang sudah pernah dibuat dengan
            nama/jabatan itu <strong>tetap valid</strong> karena nama dan
            jabatan dibekukan ke record tanda tangan.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3 — Buat archive (catat surat)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            Di <Link className="underline" href="/dashboard/archives">Archives</Link>, tekan{" "}
            <em>New archive</em> dan isi metadata surat:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Number</strong> — nomor surat (mis. <em>001/UNIGA/REK/V/2026</em>).</li>
            <li><strong>Subject</strong> — perihal singkat (mis. <em>Pengumuman libur semester genap</em>).</li>
            <li><strong>Description</strong> — opsional, ringkasan isi surat untuk ditampilkan di halaman verifikasi.</li>
            <li><strong>Issued at</strong> — tanggal terbit surat.</li>
          </ul>
          <p>
            Selama belum ditandatangani, archive bisa diedit. Setelah
            ditandatangani, metadata <strong>terkunci</strong> — kalau ada
            kesalahan, cabut tanda tangan dulu, edit, lalu tandatangani
            ulang.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 4 — Tandatangani</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>Buka detail archive, pilih signatory dari dropdown, klik <em>Sign archive</em>.</p>
          <p>Yang terjadi di balik layar:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Sistem membuat token UUID acak (unik global).</li>
            <li>
              Hash HMAC-SHA256 dihitung dari{" "}
              <code>(archiveId | number | subject | issuedAt | signatoryId | signatoryName | signatoryPosition | signedAt | token)</code>{" "}
              menggunakan <code>SIGNATURE_SECRET</code> server.
            </li>
            <li>
              Sebuah <code>ArchiveSignature</code> baru disimpan, lengkap
              dengan snapshot nama + jabatan signatory <em>saat ini</em>{" "}
              (bukan reference live — agar tidak berubah kalau signatory
              di-update kemudian).
            </li>
            <li>
              URL verifikasi disusun: <code>&lt;verifyBaseUrl&gt;/verify/&lt;token&gt;</code>.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 5 — Tempel ke dokumen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>Di detail archive yang sudah ditandatangani, ada dua opsi unduhan:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <Badge variant="success">Recommended</Badge>{" "}
              <strong>Visualisasi tanda tangan (PNG)</strong> — gambar
              komposit berisi QR + teks &quot;Ditandatangani secara elektronik oleh&quot;
              + jabatan + nama. Tinggal copy-paste ke Word/PDF di tempat
              tanda tangan basah biasanya berada.
            </li>
            <li>
              <strong>QR saja (PNG / SVG)</strong> — kalau kamu mau atur
              layout teksnya sendiri di template surat.
            </li>
          </ul>
          <p>Setelah ditempel, simpan ke PDF dan kirim seperti biasa.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status verifikasi yang mungkin tampil</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>
              <Badge variant="success">Signature valid</Badge> — semua
              metadata cocok dengan record dan HMAC. Dokumen sah.
            </li>
            <li>
              <Badge variant="danger">Signature revoked</Badge> — admin
              telah mencabut tanda tangan. Dokumen tidak berlaku lagi.
            </li>
            <li>
              <Badge variant="warning">Integrity check failed</Badge> — ada
              field yang berubah setelah ditandatangani (mis. nomor surat
              atau perihal diubah di database). Curigai dokumen palsu.
            </li>
            <li>
              <Badge variant="default">Not found</Badge> — token QR tidak
              cocok dengan record manapun. QR palsu atau record sudah
              dihapus.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup domain (.ac.id) — sekali saja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>
            Trust dari penerima surat naik signifikan kalau QR mengarah ke
            domain resmi instansi (mis. <code>unigamalang.ac.id</code>).
            Pilih salah satu opsi:
          </p>
          <div>
            <p>
              <strong>Opsi A — Subdomain di Vercel</strong> (paling simpel)
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Buat DNS CNAME: <code>tte.unigamalang.ac.id → cname.vercel-dns.com</code>.</li>
              <li>Di Vercel: Settings → Domains → Add <code>tte.unigamalang.ac.id</code>.</li>
              <li>
                Update env <code>NEXTAUTH_URL</code> + <code>NEXT_PUBLIC_APP_URL</code>{" "}
                ke <code>https://tte.unigamalang.ac.id</code>.
              </li>
              <li>
                Set <code>verifyBaseUrl</code> ke{" "}
                <code>https://tte.unigamalang.ac.id</code> juga di profil
                organisasi.
              </li>
            </ol>
          </div>
          <div>
            <p>
              <strong>Opsi B — Reverse-proxy path</strong> kalau{" "}
              <code>unigamalang.ac.id</code> sudah dipakai website utama
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                Konfigurasi reverse proxy (Nginx/Cloudflare Worker) yang
                forward <code>unigamalang.ac.id/verify/*</code> ke aplikasi
                ini di Vercel.
              </li>
              <li>
                Set <code>verifyBaseUrl</code> = <code>https://unigamalang.ac.id</code>{" "}
                di profil organisasi. Dashboard tetap diakses di domain
                Vercel; hanya halaman verifikasi yang di-domain resmi.
              </li>
            </ol>
          </div>
          {verifyHost ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              Saat ini QR akan mengarah ke <strong>{verifyHost}</strong>.
              Pastikan domain ini sudah berfungsi dan meneruskan{" "}
              <code>/verify/&lt;token&gt;</code> ke aplikasi.
            </p>
          ) : (
            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <code>verifyBaseUrl</code> belum di-set, QR akan menggunakan
              host aplikasi (<code>NEXT_PUBLIC_APP_URL</code>) sebagai
              fallback.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <div>
            <p className="font-medium">Apa bedanya dengan BSrE (Balai Sertifikasi Elektronik)?</p>
            <p className="text-slate-600">
              BSrE menerbitkan sertifikat X.509 yang mengikat identitas ke
              kunci privat — standar PKI. Sistem ini lebih ringan: tanda
              tangan dijamin oleh kombinasi (domain resmi instansi + HMAC
              server-side). Cocok untuk surat internal/eksternal yang
              kepercayaannya berbasis &quot;domain resmi instansi&quot;. Bisa diupgrade
              ke PKI nanti karena verify endpoint sudah mengembalikan JSON
              terstruktur.
            </p>
          </div>
          <div>
            <p className="font-medium">Apa yang terjadi kalau QR dipalsukan?</p>
            <p className="text-slate-600">
              QR palsu akan menampilkan status <em>Not found</em> atau{" "}
              <em>Integrity check failed</em>, karena hanya server kami yang
              tahu <code>SIGNATURE_SECRET</code>.
            </p>
          </div>
          <div>
            <p className="font-medium">Apa yang terjadi kalau database di-tampering langsung?</p>
            <p className="text-slate-600">
              HMAC mengunci kombinasi metadata. Mengubah nomor surat,
              perihal, tanggal, nama, atau jabatan setelah ditandatangani
              akan membuat halaman verifikasi menampilkan{" "}
              <Badge variant="warning">Integrity check failed</Badge>.
            </p>
          </div>
          <div>
            <p className="font-medium">Bisakah dokumen lama tetap valid kalau signatory pensiun?</p>
            <p className="text-slate-600">
              Bisa. Nama dan jabatan dibekukan ke record tanda tangan saat
              ditandatangani. Walau signatory di-soft-delete, dokumen lama
              tetap menampilkan informasi yang sama saat itu.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
