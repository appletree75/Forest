export default function ProtectedLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[color:var(--border)] border-t-[color:var(--accent)]" />
        <div className="text-sm font-medium text-[color:var(--muted)]">
          Loading...
        </div>
      </div>
    </div>
  );
}
