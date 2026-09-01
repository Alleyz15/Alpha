export default function MonoValue({
  as: Component = 'span',
  value,
  className = '',
  children,
  ...props
}) {
  const content = value ?? children ?? '—';

  return (
    <Component {...props} className={['alpha-mono-value', className].filter(Boolean).join(' ')}>
      {content}
    </Component>
  );
}
