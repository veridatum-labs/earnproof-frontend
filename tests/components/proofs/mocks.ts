export const mockPayments = [
  { id: 'p1', amount: 100, description: 'Payment 1' },
  { id: 'p2', amount: 200, description: 'Payment 2' }
];

export const mockWallet = {
  publicKey: 'GABC123',
};

export const mockFreighter = {
  connect: jest.fn(),
  getPublicKey: jest.fn(),
  signTransaction: jest.fn(),
};

export const mockApi = {
  createProof: jest.fn(),
  uploadReceipt: jest.fn(),
  createRecurringProof: jest.fn(),
  fetchPayments: jest.fn(),
};