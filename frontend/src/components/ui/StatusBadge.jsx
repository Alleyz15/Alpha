const defaultGlyph = {
  neutral: '○',
  primary: '◆',
  live: '●',
  success: '●',
  warning: '◐',
  danger: '○',
};

export default function StatusBadge({
  tone = 'neutral',
  glyph,
  className = '',
  children,
  ...props
}) {
  const classes = ['alpha-status-badge', `alpha-status-badge--${tone}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span {...props} className={classes}>
      <span className="alpha-status-badge__glyph" aria-hidden="true">
        {glyph ?? defaultGlyph[tone] ?? defaultGlyph.neutral}
      </span>
      <span>{children}</span>
    </span>
  );
}
