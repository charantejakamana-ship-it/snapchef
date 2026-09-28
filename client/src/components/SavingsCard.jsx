const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function SavingsCard({ summary, loading }) {
  const saved = summary?.saved || 0;
  const wasted = summary?.wasted || 0;
  const inKitchen = summary?.inKitchen || 0;
  const total = saved + wasted;
  const rate = total > 0 ? Math.round((saved / total) * 100) : null;

  return (
    <div className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white shadow-lg shadow-emerald-500/25">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
            Money you&apos;ve rescued
          </p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {loading ? '₹—' : inr(saved)}
          </p>
          {summary?.savedThisMonth > 0 && (
            <p className="mt-1 text-sm text-white/80">{inr(summary.savedThisMonth)} in the last 30 days</p>
          )}
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl backdrop-blur">
          💰
        </span>
      </div>

      {rate !== null && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-medium text-white/85">
            <span>{rate}% of your food gets eaten</span>
            <span>{inr(wasted)} binned</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${rate}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4 text-center">
        <div>
          <p className="text-lg font-extrabold">{inr(inKitchen)}</p>
          <p className="text-[11px] leading-tight text-white/75">in your kitchen</p>
        </div>
        <div>
          <p className="text-lg font-extrabold">{summary?.counts?.used || 0}</p>
          <p className="text-[11px] leading-tight text-white/75">ingredients used</p>
        </div>
        <div>
          <p className="text-lg font-extrabold">{summary?.counts?.wasted || 0}</p>
          <p className="text-[11px] leading-tight text-white/75">thrown away</p>
        </div>
      </div>
    </div>
  );
}
