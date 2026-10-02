type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-8">
      {eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
          {eyebrow}
        </div>
      ) : null}
      <h1 className={`${eyebrow ? "mt-3" : ""} text-3xl font-semibold tracking-tight`}>
        {title}
      </h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          {description}
        </p>
      ) : null}
    </header>
  );
}
