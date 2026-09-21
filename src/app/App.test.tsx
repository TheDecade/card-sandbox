import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { formatBytes } from './platform';

beforeAll(() => {
  // jsdom lays nothing out; give elements a size so the virtualized card list renders rows.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 800 }),
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
});

async function renderApp() {
  render(<App />);
  await screen.findByRole('button', { name: 'Card Edit' }); // wait for the library to load
}

describe('App shell', () => {
  it('shows the main menu with all four actions', async () => {
    await renderApp();
    for (const label of ['Playtest', 'Card Edit', 'Options', 'Reset Playtest']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('asks for confirmation before resetting', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Playtest' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Reset Playtest?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('navigates to Options and back', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('heading', { name: 'Options' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.getByRole('button', { name: 'Card Edit' })).toBeInTheDocument();
  });
});

describe('Card Edit', () => {
  it('creates a card, edits it, and discards a new card without saving', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Card Edit' }));
    expect(await screen.findByText('No cards yet.')).toBeInTheDocument();

    // Create
    fireEvent.click(screen.getAllByRole('button', { name: '+ New card' })[0]!);
    let editor = screen.getByRole('dialog', { name: 'Edit card' });
    fireEvent.change(within(editor).getByPlaceholderText('Card name'), { target: { value: 'Ember Scout' } });
    fireEvent.change(within(editor).getByPlaceholderText('e.g. {2}{W}'), { target: { value: '2' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const row = await screen.findByRole('button', { name: /Ember Scout/ });
    expect(row).toHaveTextContent('2');

    // Edit, then disable from the editor
    fireEvent.click(row);
    editor = screen.getByRole('dialog', { name: 'Edit card' });
    fireEvent.change(within(editor).getByPlaceholderText('Card name'), { target: { value: 'Ember Scout II' } });
    fireEvent.click(within(editor).getByRole('switch', { name: 'Enabled' }));
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: /Ember Scout II/ })).toHaveTextContent('Disabled');
    expect(screen.getByRole('tab', { name: /Disabled/ })).toHaveTextContent('1');

    // A new card discarded is never created
    fireEvent.click(screen.getByRole('button', { name: '+ New card' }));
    editor = screen.getByRole('dialog', { name: 'Edit card' });
    fireEvent.click(within(editor).getByRole('button', { name: 'Discard' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('1');
  });
});

describe('Options', () => {
  it('changes the number of players, asking before removing one from a running playtest', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Playtest' })); // starts a 2-player playtest
    expect(await screen.findByText(/of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));

    fireEvent.click(screen.getByRole('button', { name: 'More players' }));
    await waitFor(() => expect(screen.getByLabelText('Number of players')).toHaveTextContent('3'));

    fireEvent.click(screen.getByRole('button', { name: 'Fewer players' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove Player 3?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Number of players')).toHaveTextContent('3');

    fireEvent.click(screen.getByRole('button', { name: 'Fewer players' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByLabelText('Number of players')).toHaveTextContent('2'));
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
  });
});
