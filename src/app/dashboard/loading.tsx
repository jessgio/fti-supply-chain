export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-8 p-8">
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-stone-200" />
        <div className="h-9 w-96 max-w-full rounded bg-stone-200" />
        <div className="h-4 w-full max-w-2xl rounded bg-stone-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-stone-200 bg-white" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl border border-stone-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
