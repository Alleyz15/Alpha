import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Alert from './Alert.jsx';
import AsyncState from './AsyncState.jsx';
import Card from './Card.jsx';
import MonoValue from './MonoValue.jsx';
import RealityBadge from './RealityBadge.jsx';
import StatusBadge from './StatusBadge.jsx';

describe('display components', () => {
  it('renders status meaning as text in addition to its visual glyph', () => {
    render(<StatusBadge tone="success">Active</StatusBadge>);
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('●')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['live', 'Live'],
    ['simulated', 'Simulated'],
    ['operator', 'Operator executes'],
    ['comparison', 'Comparison only'],
  ])('renders the %s reality boundary', (kind, label) => {
    render(<RealityBadge kind={kind} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it('renders zero as a real monospaced value and null as a placeholder', () => {
    const { rerender } = render(<MonoValue value={0} />);
    expect(screen.getByText('0')).toHaveClass('alpha-mono-value');

    rerender(<MonoValue value={null} />);
    expect(screen.getByText('—')).toBeVisible();
  });

  it('uses an alert role for error messages', () => {
    render(<Alert tone="error" title="Could not load">Try again later.</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again later.');
  });

  it('supports semantic interactive cards', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Card as="button" interactive onClick={onClick}>Open position</Card>);

    await user.click(screen.getByRole('button', { name: 'Open position' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('AsyncState', () => {
  it('offers a working retry action for errors', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<AsyncState state="error" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders ready content without an extra wrapper', () => {
    render(<AsyncState state="ready"><p>Loaded position</p></AsyncState>);
    expect(screen.getByText('Loaded position')).toBeVisible();
  });
});
