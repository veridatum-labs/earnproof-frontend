import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import IntervalConfigStep from '../../components/proofs/IntervalConfigStep';

describe('IntervalConfigStep', () => {
  test('renders interval options and calls onNext with selected value', async () => {
    const onNext = jest.fn();
    const user = userEvent.setup();
    render(<IntervalConfigStep onNext={onNext} />);

    expect(screen.getByText(/interval config/i)).toBeInTheDocument();
    await user.click(screen.getByLabel(/monthly/i));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ interval: 'monthly' }));
  });

  test('shows validation error when no interval is selected', async () => {
    const user = userEvent.setup();
    render(<IntervalConfigStep />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/select an interval/i);
  });
});