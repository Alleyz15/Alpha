import { useId } from 'react';

export default function SegmentedControl({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
  className = '',
}) {
  const generatedName = useId();
  const groupName = name ?? `alpha-segment-${generatedName}`;

  return (
    <fieldset className={['alpha-segment', className].filter(Boolean).join(' ')}>
      <legend className="alpha-segment__legend">{legend}</legend>
      {hint && <p className="alpha-segment__hint">{hint}</p>}
      <div className="alpha-segment__options">
        {options.map((option) => (
          <label
            className={[
              'alpha-segment__option',
              option.value === value ? 'alpha-segment__option--selected' : '',
              option.disabled ? 'alpha-segment__option--disabled' : '',
            ].filter(Boolean).join(' ')}
            key={option.value}
          >
            <input
              className="alpha-segment__input"
              type="radio"
              name={groupName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
            />
            <span className="alpha-segment__body">
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
