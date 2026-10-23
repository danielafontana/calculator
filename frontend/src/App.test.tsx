import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App';
import * as api from './services/api';

vi.mock('./services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  getOperations: vi.fn(),
}));

describe('<App />', () => {
  it('renders the calculator', () => {
    vi.mocked(api.getOperations).mockResolvedValue([]);
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Calculadora' })).toBeInTheDocument();
  });
});
