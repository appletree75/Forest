type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-8">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
        {eyebrow}
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
        {description}
      </p>
    </header>
  );
}
