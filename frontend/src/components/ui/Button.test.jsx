import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Button from './Button.jsx';

describe('Button', () => {
  it('can be activated from the keyboard', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Continue</Button>);

    await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disables interaction and announces activity while loading', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button loading loadingLabel="Submitting…" onClick={onClick}>Submit</Button>);

    const button = screen.getByRole('button', { name: 'Submitting…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
