import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { SessionList } from "../session-list";
import { revokeSession, revokeAllOtherSessions } from "@/lib/sessions/store";
jest.mock("@/lib/sessions/store", () => ({ revokeSession: jest.fn(), revokeAllOtherSessions: jest.fn() }));
const current = { id: "current", deviceLabel: "Linux - Firefox", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-02T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, isCurrent: true };
const other = { ...current, id: "other", deviceLabel: "iOS - Safari", isCurrent: false };
beforeEach(() => jest.clearAllMocks());
it("requires confirmation and supports cancellation without sending", () => {
  render(<SessionList userId="user-1" sessions={[current, other]} loading={false} onSessionsChanged={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" })); expect(revokeSession).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { hidden: true })).getByRole("button", { name: "Cancel", hidden: true })); expect(revokeSession).not.toHaveBeenCalled();
});
it("waits for server revocation before updating rows", async () => {
  let resolve!: (value: { revokedSessionId: string; currentSessionRevoked: boolean }) => void;
  jest.mocked(revokeSession).mockImplementationOnce(() => new Promise(done => { resolve = done; })); const changed = jest.fn();
  render(<SessionList userId="user-1" sessions={[current, other]} loading={false} onSessionsChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" })); fireEvent.click(within(screen.getByRole("dialog", { hidden: true })).getByRole("button", { name: "Sign out", hidden: true }));
  expect(changed).not.toHaveBeenCalled(); resolve({ revokedSessionId: "other", currentSessionRevoked: false }); await waitFor(() => expect(changed).toHaveBeenCalledWith([current]));
});
it("runs the logout cleanup callback when the server revokes this device", async () => {
  jest.mocked(revokeSession).mockResolvedValue({ revokedSessionId: "current", currentSessionRevoked: true }); const logout = jest.fn();
  render(<SessionList userId="user-1" sessions={[current]} loading={false} onSessionsChanged={jest.fn()} onCurrentSessionRevoked={logout} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" })); fireEvent.click(within(screen.getByRole("dialog", { hidden: true })).getByRole("button", { name: "Sign out", hidden: true })); await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});
it("announces server failures without optimistic success", async () => {
  jest.mocked(revokeAllOtherSessions).mockRejectedValue(new Error("Forbidden")); const changed = jest.fn();
  render(<SessionList userId="user-1" sessions={[current, other]} loading={false} onSessionsChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "Sign out all other sessions" })); fireEvent.click(within(screen.getByRole("dialog", { hidden: true })).getByRole("button", { name: "Sign out all", hidden: true })); await screen.findByRole("alert"); expect(changed).not.toHaveBeenCalled();
});
