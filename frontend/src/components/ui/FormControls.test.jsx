import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import FormField from './FormField.jsx';
import SegmentedControl from './SegmentedControl.jsx';

describe('FormField', () => {
  it('associates its label, hint, and error with the form control', () => {
    render(
      <FormField
        id="price"
        label="Hypothetical ETH price"
        hint="Enter a future price for comparison."
        error="Enter a positive amount."
        required
      >
        <input type="number" />
      </FormField>,
    );

    const input = screen.getByLabelText(/Hypothetical ETH price/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'Enter a future price for comparison. Enter a positive amount.',
    );
  });
});

describe('SegmentedControl', () => {
  function Example() {
    const [value, setValue] = useState('current');
    return (
      <SegmentedControl
        legend="Comparison rule"
        name="comparison-rule"
        value={value}
        onChange={setValue}
        options={[
          { value: 'current', label: 'Current rule' },
          { value: 'actual', label: 'Original rule' },
        ]}
      />
    );
  }

  it('uses native radio behavior for mutually exclusive choices', async () => {
    const user = userEvent.setup();
    render(<Example />);

    const current = screen.getByRole('radio', { name: 'Current rule' });
    const actual = screen.getByRole('radio', { name: 'Original rule' });
    expect(current).toBeChecked();

    await user.click(actual);
    expect(actual).toBeChecked();
    expect(current).not.toBeChecked();
  });
});
