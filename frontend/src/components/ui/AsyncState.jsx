import Alert from './Alert.jsx';
import Button from './Button.jsx';

export default function AsyncState({
  state,
  loadingLabel = 'Loading…',
  errorTitle = 'Something went wrong',
  errorMessage = 'Try again in a moment.',
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  retryLabel = 'Try again',
  onRetry,
  children,
}) {
  if (state === 'loading') {
    return (
      <div className="alpha-async-state" role="status" aria-live="polite">
        <span className="alpha-async-state__spinner" aria-hidden="true" />
        <p>{loadingLabel}</p>
      </div>
    );
  }

  if (state === 'error') {
    const actions = onRetry ? <Button variant="ghost" size="small" onClick={onRetry}>{retryLabel}</Button> : null;
    return <Alert tone="error" title={errorTitle} actions={actions}>{errorMessage}</Alert>;
  }

  if (state === 'empty') {
    return (
      <div className="alpha-async-state alpha-async-state--empty">
        <span className="alpha-async-state__mark" aria-hidden="true">○</span>
        <strong>{emptyTitle}</strong>
        {emptyMessage && <p>{emptyMessage}</p>}
      </div>
    );
  }

  return children;
}
