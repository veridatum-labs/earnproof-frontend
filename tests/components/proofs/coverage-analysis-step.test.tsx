import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CoverageAnalysisStep from '../../components/proofs/CoverageAnalysisStep';

describe('CoverageAnalysisStep', () => {
  test('renders coverage details and calls onNext when confirmed', async () => {
    const onNext = jest.fn();
    const user = userEvent.setup();
    render(<CoverageAnalysisStep onNext={onNext} data={{ interval: 'monthly', period: '12 months' }} />);

    expect(screen.getByText(/coverage analysis/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onNext).toHaveBeenCalled();
  });

  test('calls onBack when back button is clicked', async () => {
    const onBack = jest.fn();
    const user = userEvent.setup();
    render(<CoverageAnalysisStep onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});