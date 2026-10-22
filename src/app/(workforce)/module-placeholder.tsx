export function ModulePlaceholder({
  eyebrow,
  title,
  description,
  inProgressLabel,
  emptyDataLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  inProgressLabel: string;
  emptyDataLabel: string;
}) {
  return (
    <section className="module-placeholder">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="placeholder-card">
        <span aria-hidden="true" className="placeholder-mark">↗</span>
        <div>
          <strong>{inProgressLabel}</strong>
          <p>{description}</p>
          <p className="muted">{emptyDataLabel}</p>
        </div>
      </div>
    </section>
  );
}
