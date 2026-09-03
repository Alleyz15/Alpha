// The primary navigation.
//
// /vault and /lending are real routes that nothing linked to: the only ways in
// were a card near the bottom of the welcome page, or typing the URL. These
// tests pin the links and the active state so a route cannot go dark again.

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import SiteNavigation from './SiteNavigation.jsx';

function renderNav(path) {
  return render(
    <MemoryRouter initialEntries={[path]}><SiteNavigation /></MemoryRouter>,
  );
}

describe('SiteNavigation', () => {
  it('links to every top-level destination', () => {
    renderNav('/portfolio');
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });

    expect(within(nav).getByRole('link', { name: 'Markets' })).toHaveAttribute('href', '/markets');
    expect(within(nav).getByRole('link', { name: 'My Portfolio' })).toHaveAttribute('href', '/portfolio');
    expect(within(nav).getByRole('link', { name: 'Vault' })).toHaveAttribute('href', '/vault');
    expect(within(nav).getByRole('link', { name: 'Lending' })).toHaveAttribute('href', '/lending');
  });

  it('marks only the current destination as the current page', () => {
    renderNav('/lending');
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });

    expect(within(nav).getByRole('link', { name: 'Lending' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Vault' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Markets' })).not.toHaveAttribute('aria-current');
  });
});
