import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
          Campus Fast Food
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Join the line without waiting in it.</h1>
        <p className="mx-auto mt-4 max-w-md text-slate-300">
          Use the Telegram bot to choose your meal, join today&apos;s line, and receive updates when your turn is near.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex rounded-lg bg-amber-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-amber-400"
        >
          Staff dashboard
        </Link>
      </section>
    </main>
  );
}
