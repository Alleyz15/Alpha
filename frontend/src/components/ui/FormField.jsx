import { Children, cloneElement, isValidElement, useId } from 'react';

export default function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  className = '',
  children,
}) {
  const generatedId = useId();
  const control = Children.only(children);

  if (!isValidElement(control)) {
    throw new TypeError('FormField expects one form control as its child.');
  }

  const fieldId = id ?? control.props.id ?? `alpha-field-${generatedId}`;
  const hintId = hint ? `${fieldId}-hint` : null;
  const errorId = error ? `${fieldId}-error` : null;
  const describedBy = [control.props['aria-describedby'], hintId, errorId]
    .filter(Boolean)
    .join(' ');

  const labelledControl = cloneElement(control, {
    id: fieldId,
    required: required || control.props.required,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': error ? true : control.props['aria-invalid'],
  });

  return (
    <div className={['alpha-field', error ? 'alpha-field--invalid' : '', className].filter(Boolean).join(' ')}>
      <label className="alpha-field__label" htmlFor={fieldId}>
        <span>{label}</span>
        {required && <span className="alpha-field__required">Required</span>}
      </label>
      {labelledControl}
      {hint && <span className="alpha-field__hint" id={hintId}>{hint}</span>}
      {error && <span className="alpha-field__error" id={errorId}>{error}</span>}
    </div>
  );
}
