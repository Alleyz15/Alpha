export default function Card({
  as: Component = 'section',
  variant = 'standard',
  interactive = false,
  className = '',
  children,
  ...props
}) {
  const classes = [
    'alpha-card',
    `alpha-card--${variant}`,
    interactive ? 'alpha-card--interactive' : '',
    className,
  ].filter(Boolean).join(' ');
  const componentProps = Component === 'button' ? { type: 'button', ...props } : props;

  return <Component {...componentProps} className={classes}>{children}</Component>;
}
