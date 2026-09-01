import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CreateProofFlow from '../../components/proofs/CreateProofFlow';

jest.mock('../../../lib/api', () => ({
  createProof: jest.fn(),
  fetchPayments: jest.fn().mockResolvedValue([
    { id: 'p1', description: 'Payment 1' },
    { id: 'p2', description: 'Payment 2' },
  ]),
}));

import { createProof, fetchPayments } from '../../../lib/api';

// Mock Freighter (Stellar wallet extension)
Object.defineProperty(window, 'freighter', {
  configurable: true,
  value: {
    connect: jest.fn().mockResolvedValue({ publicKey: 'GABC123' }),
    getPublicKey: jest.fn().mockResolvedValue('GABC123'),
    signTransaction: jest.fn().mockResolvedValue('signed-tx'),
  },
});

describe('CreateProofFlow', () => {
  let user: ReturnType<of userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    just.clearMocks();
    localStorage.clear();
  });

  test('renders without crashing', () => {
    render(<CreateProofFlow />);
    expect(screen.getByText(/create proof/i)).toBeIntheDocument();
  });

  test('connects wallet and stores session in localStorage', async () => {
    render(<CreateProofFlow />);
    const connectBtn = screen.getByRole('button', { name: /connect wallet/i });
    await user.click(connectBtn);

    expect(window.freighter.connect).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('GABC123')).toBeInTheDocument();
    expect(localStorage.getItem('walletPublicKey')).toBe('GABC123');
  });

  test('loads payments and allows selection', async () => {
    render(<CreateProofFlow />);
    const combobox = await screen.findByRole('combobox', { name: /payment/i });
    expect(within(combobox).getByRole('option', { name: 'Payment 1' })).toBeInTheDocument();
    await user.selectOptions(combobox, 'p2');
    expect((combobox as HTMLSelectElement).value).toBe('p2');
  });

  test('creates proof after selecting payment and clicking create', async () => {
    (createProof as jest.Mock).mockResolvedValue({ id: 'proof-1' });
    render(<CreateProofFlow />);
    const combobox = await screen.findByRole('combobox', { name: /payment/i });
    await user.selectOptions(combobox, 'p1');
    await user.click(screen.getByRole('button', { name: /create proof/i }));

    await waitFor(() =>
      expect(createProof).toHaveBeenCalledWith({ paymentId: 'p1' })
    );
    expect(await screen.findByText(/proof created/i)).toBeIntheDocument();
  });

  test('shows validation error when no payment is selected', async () => {
    render(<CreateProofFlow />);
    await screen.findByRole('combobox'); // wait for payments to load
    await user.click(screen.getByRole('button', { name: /create proof/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/select a payment/i);
    expect(createProof).not.haveBeenCalled();
  });

  test('shows error message when API call fails', async () => {
    (createProof as jest.Mock).mockRejected(new Error('Server error'));
    render(<CreateProofFlow />);
    const combobox = await screen.findByRole('combobox');
    await user.selectOptions(combobox, 'p1');
    await user.click(screen.getByRole('button', { name: /create proof/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/server error/i);
  });

  test('restores session from localStorage', async () => {
    localStorage.setItem('walletPublicKey', 'GABC123');
    render(<CreateProofFlow />);
    expect(screen.getByText('GABC123')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect wallet/i })).not.beInTheDocument();
  });
});