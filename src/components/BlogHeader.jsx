import Link from "next/link";

export default function BlogHeader() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-6 py-10 md:px-10 md:py-14">
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative max-w-5xl">
        <p className="text-sm tracking-wide text-emerald-300/80">From the blog</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Fix ghost stock faster—guides, playbooks & case studies
        </h2>
        <p className="mt-3 max-w-3xl text-gray-300">
          Practical, merchant-tested tactics for Shopify inventory accuracy: cycle counting, shrink
          prevention, and reconciliation routines that actually stick.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/blog"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
          >
            Read the blog
          </Link>

          <a
            href="/blog/#/portal/signup"
            className="inline-flex items-center justify-center rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 font-semibold text-white hover:bg-gray-800"
          >
            Get new posts by email
          </a>
        </div>

        <div className="mt-4 text-xs text-gray-400">
          New: <span className="italic">“The 30-minute weekly count that kills phantom inventory.”</span>
        </div>
      </div>
    </section>
  );
}
