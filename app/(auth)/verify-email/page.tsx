export default function VerifyEmailPage() {
	return (
		<main className="min-h-[100dvh] bg-canvas flex items-center justify-center p-4">
			<section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
				<h1 className="text-2xl font-bold text-slate-900">Verifikasi email tidak diperlukan</h1>
				<p className="mt-3 text-sm text-slate-600">Akun dapat langsung digunakan setelah pendaftaran. Silakan masuk menggunakan NIK dan password.</p>
				<a href="/stationaryapps/login" className="mt-6 inline-block font-semibold text-brand-700 hover:underline">Kembali ke halaman masuk</a>
			</section>
		</main>
	);
}
