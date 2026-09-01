const alertGlyph = {
  info: '◆',
  success: '●',
  warning: '◐',
  error: '○',
};

export default function Alert({
  tone = 'info',
  title,
  children,
  actions,
  className = '',
  role,
  ...props
}) {
  const semanticRole = role ?? (tone === 'error' ? 'alert' : 'status');

  return (
    <div
      {...props}
      className={['alpha-alert', `alpha-alert--${tone}`, className].filter(Boolean).join(' ')}
      role={semanticRole}
    >
      <span className="alpha-alert__glyph" aria-hidden="true">{alertGlyph[tone] ?? alertGlyph.info}</span>
      <div className="alpha-alert__content">
        {title && <strong>{title}</strong>}
        {children && <div className="alpha-alert__message">{children}</div>}
        {actions && <div className="alpha-alert__actions">{actions}</div>}
      </div>
    </div>
  );
}
