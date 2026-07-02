type StatCardProps = {
  label: string;
  value: string;
  detail: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <section className="rounded-[28px] border border-[var(--border)] bg-[color:var(--panel-strong)] p-5 shadow-[0_16px_50px_rgba(24,34,24,0.06)]">
      <div className="text-sm text-[color:var(--muted)]">{label}</div>
      <div className="mt-4 text-3xl font-semibold">{value}</div>
      <div className="mt-2 text-sm text-[color:var(--muted)]">{detail}</div>
    </section>
  );
}
