import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { formatBytes } from './platform';

describe('App shell', () => {
  it('shows the main menu with all four actions', () => {
    render(<App />);
    for (const label of ['Playtest', 'Card Edit', 'Options', 'Reset Playtest']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('asks for confirmation before resetting', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Playtest' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Reset Playtest?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('navigates to Options and back', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('heading', { name: 'Options' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.getByRole('button', { name: 'Card Edit' })).toBeInTheDocument();
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
  });
});
