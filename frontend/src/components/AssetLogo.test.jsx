import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AssetLogo from './AssetLogo.jsx';

describe('AssetLogo', () => {
  it('uses the local logo and full asset name for known assets', () => {
    render(<AssetLogo symbol="ETH" />);

    expect(screen.getByRole('img', { name: 'Ethereum' })).toHaveAttribute('src', '/assets/coins/eth.svg');
  });

  it('falls back from an API image to the local asset and then to a letter', () => {
    render(<AssetLogo symbol="AVAX" imageUrl="https://example.invalid/avax.png" />);

    const remoteImage = screen.getByRole('img', { name: 'Avalanche' });
    fireEvent.error(remoteImage);
    expect(screen.getByRole('img', { name: 'Avalanche' })).toHaveAttribute('src', '/assets/coins/avax.svg');
    fireEvent.error(screen.getByRole('img', { name: 'Avalanche' }));
    expect(screen.getByRole('img', { name: 'Avalanche' })).toHaveTextContent('A');
  });

  it('uses a letter fallback for unknown symbols', () => {
    render(<AssetLogo symbol="DOGE" name="Dogecoin" />);

    expect(screen.getByRole('img', { name: 'Dogecoin' })).toHaveTextContent('D');
  });
});
