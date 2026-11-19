import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionManagement } from "../session-management";
import { listActiveSessions } from "@/lib/sessions/store";
let token: string | null = "synthetic";
jest.mock("@/lib/use-session", () => ({ useSessionToken: () => token }));
jest.mock("@/lib/session", () => ({ readStoredSession: () => ({ token: "synthetic", user: { id: "user-1" } }), clearStoredSession: jest.fn() }));
jest.mock("@/lib/storage", () => ({ clearAllStorage: jest.fn() }));
jest.mock("@/lib/sessions/store", () => ({ listActiveSessions: jest.fn(), revokeSession: jest.fn(), revokeAllOtherSessions: jest.fn() }));
const list = jest.mocked(listActiveSessions);
const record = { id: "session-1", deviceLabel: "Linux - Firefox", createdAt: "2026-01-01T00:00:00.000Z", lastUsedAt: "2026-01-02T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, isCurrent: true };
beforeEach(() => { jest.clearAllMocks(); token = "synthetic"; list.mockResolvedValue([record]); });
it("requires authentication without issuing requests", () => { token = null; render(<SessionManagement />); expect(screen.getByRole("alert")).toHaveTextContent(/Authentication required/i); expect(list).not.toHaveBeenCalled(); });
it("paginates one authoritative inventory without inventing a backend cursor", async () => {
  list.mockResolvedValueOnce([record, ...Array.from({ length: 10 }, (_, index) => ({ ...record, id: `remote-${index}`, isCurrent: false, deviceLabel: `Other device ${index}` }))]);
  render(<SessionManagement />); await screen.findByText("This device");
  expect(screen.queryByText("Other device 9")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Load more sessions" })); await screen.findByText("Other device 9");
  expect(list).toHaveBeenCalledTimes(1);
});
it("drops stale session rows after a refresh error", async () => {
  render(<SessionManagement />); await screen.findByText("This device"); list.mockRejectedValueOnce(new Error("Forbidden"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" })); await screen.findByRole("alert"); expect(screen.queryByText("This device")).not.toBeInTheDocument();
});
it("aborts outstanding requests on navigation", async () => {
  list.mockImplementationOnce(() => new Promise(() => {}));
  const view = render(<SessionManagement />); await waitFor(() => expect(list).toHaveBeenCalled()); const signal = list.mock.calls[0][1]; view.unmount(); expect(signal?.aborted).toBe(true);
});
