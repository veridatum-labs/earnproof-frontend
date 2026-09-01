import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PeriodConfigStep from '../../components/proofs/PeriodConfigStep';

describe('PeriodConfigStep', () => {
  test('renders period options and calls onNext with selected value', async () => {
    const onNext = jest.fn();
    const user = userEvent.setup();
    render(<PeriodConfigStep onNext={onNext} />);

    expect(screen.getByText(/period config/i)).toBeInTheDocument();
    await user.click(screen.getByLabel(/12 months/i));
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ period: '12 months' }));
  });

  test('shows validation error when no period is selected', async () => {
    const user = userEvent.setup();
    render(<PeriodConfigStep />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/select a period/i);
  });
});