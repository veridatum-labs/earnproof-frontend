// Synthetic server fixture for the pre-existing risk-history presentation tests.
const revoked = new Set<string>();
function records(userId: string) {
  return [
    { id: `current-${userId}`, deviceLabel: "macOS - Chrome", isCurrent: true },
    { id: "seed-1", deviceLabel: "iOS - Safari", isCurrent: false },
    { id: "seed-2", deviceLabel: "Windows - Edge", isCurrent: false },
  ].map(item => ({ ...item, expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-02T00:00:00.000Z", revokedAt: revoked.has(item.id) ? "2026-01-03T00:00:00.000Z" : null }));
}
export const sessionStoreMock = {
  listActiveSessions: jest.fn(async (userId: string) => records(userId).filter(item => !item.revokedAt)),
  listRecentlyRevokedSessions: jest.fn(async (userId: string) => records(userId).filter(item => item.revokedAt)),
  revokeSession: jest.fn(async (_userId: string, id: string) => { revoked.add(id); return { revokedSessionId: id, currentSessionRevoked: false }; }),
};
export function resetSessionFixture() { revoked.clear(); }
