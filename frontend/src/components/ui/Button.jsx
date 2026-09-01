export default function Button({
  variant = 'primary',
  size = 'default',
  loading = false,
  loadingLabel = 'Working…',
  disabled = false,
  className = '',
  type = 'button',
  children,
  ...props
}) {
  const classes = [
    'alpha-button',
    `alpha-button--${variant}`,
    `alpha-button--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      className={classes}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="alpha-button__spinner" aria-hidden="true" />}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
