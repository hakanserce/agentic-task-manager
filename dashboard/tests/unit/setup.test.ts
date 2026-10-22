import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from '../../src/App.svelte';

describe('test setup', () => {
  it('renders a Svelte component into jsdom', () => {
    render(App);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Task Dashboard');
  });
});
