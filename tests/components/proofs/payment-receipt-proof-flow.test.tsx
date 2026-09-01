import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PaymentReceiptProofFlow from '../../components/proofs/PaymentReceiptProofFlow';

jest.mock('../../../lib/api', () => ({
  uploadReceipt: jest.fn(),
}));

import { uploadReceipt } from '../../../lib/api';

describe('PaymentReceiptProofFlow', () => {
  let user: ReturnType<of userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    just.clearMocks();
  });

  test('renders the flow', () => {
    render(<PaymentReceiptProofFlow />);
    expect(screen.getByText(/upload receipt/i)).toBeInDocument();
  });

  test('uploads a file and submits', async () => {
    (uploadReceipt as jest.Mock).mockResolvedValue({ id: 'receipt-1' });
    const file = new File(['receipt-content'], 'receipt.pdf', { type: 'application/pdf' });
    render(<PaymentReceiptProofFlow />);

    const fileInput = screen.getByLabel(/receipt file/i) as HTMLInputElement;
    await user.upload(fileInput, file);

    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() =>
      expect(uploadReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'receipt.pdf' })
      )
    );
  });

  test('shows validation error when no file is provided', async () => {
    render(<PaymentReceiptProofFlow />);
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/upload a file/i);
    expect(uploadReceipt).not.haveBeenCalled();
  });

  test('shows error message on upload failure', async () => {
    (uploadReceipt as jest.Mock).mockRejected(new Error('Upload failed'));
    const file = new File(['receipt-content'], 'receipt.pdf', { type: 'application/pdf' });
    render(<PaymentReceiptProofFlow />);
    const fileInput = screen.getByLabel(/receipt file/i);
    await user.upload(fileInput, file);
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/upload failed/i);
  });
});