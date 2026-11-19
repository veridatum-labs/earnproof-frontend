import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { TrustedSourceList } from "../trusted-source-list";
import { deleteTrustedSource, updateTrustedSource, testTrustedSource, getTrustedSourceHistory } from "@/lib/trusted-sources/store";
jest.mock("@/lib/trusted-sources/store", () => ({ deleteTrustedSource: jest.fn(), updateTrustedSource: jest.fn(), testTrustedSource: jest.fn(), getTrustedSourceHistory: jest.fn() }));
const record = { id: "source-1", organizationId: "org-1", name: "Synthetic payroll", issuerId: "issuer-1", network: "testnet" as const, status: "ACTIVE" as const, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
const issuers = [{ id: "issuer-1", name: "Synthetic issuer", status: "ACTIVE" as const }];
const props = { userId: "user-1", trustedSources: [record], issuers, loading: false, onTrustedSourceUpdated: jest.fn(), onTrustedSourceDeleted: jest.fn() };
beforeEach(() => jest.clearAllMocks());
it("requires confirmation and a server disable result before removing a source", async () => {
  jest.mocked(deleteTrustedSource).mockResolvedValue({ ...record, status: "DISABLED", version: 2 }); render(<TrustedSourceList {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Disable" })); expect(deleteTrustedSource).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { hidden: true })).getByRole("button", { name: "Disable", hidden: true })); await waitFor(() => expect(props.onTrustedSourceDeleted).toHaveBeenCalledWith(record.id));
  expect(deleteTrustedSource).toHaveBeenCalledWith("user-1", record.id, 1, expect.any(AbortSignal));
});
it("keeps the version captured when editing and announces a stale write", async () => {
  jest.mocked(updateTrustedSource).mockRejectedValue(new Error("Conflict")); render(<TrustedSourceList {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" })); fireEvent.change(screen.getByLabelText("Trusted source name"), { target: { value: "New name" } }); fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert"); expect(updateTrustedSource).toHaveBeenCalledWith("user-1", record.id, { name: "New name", issuerId: "issuer-1" }, 1, expect.any(AbortSignal)); expect(props.onTrustedSourceUpdated).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save" })); expect(updateTrustedSource).toHaveBeenCalledTimes(1);
});
it("loads connection tests and history from the server", async () => {
  jest.mocked(testTrustedSource).mockResolvedValue({ eligible: true, testedAt: record.updatedAt }); jest.mocked(getTrustedSourceHistory).mockResolvedValue([{ id: "event-1", action: "CREATE", version: 1, occurredAt: record.createdAt }]); render(<TrustedSourceList {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Test source" })); await screen.findByText("Server connection test passed.");
  fireEvent.click(screen.getByRole("button", { name: "View source history" })); await screen.findByText(/CREATE v1/);
});
it("does not offer mutation or connection tests for disabled sources", () => {
  render(<TrustedSourceList {...props} trustedSources={[{ ...record, status: "DISABLED" }]} />); expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Test source" })).toBeDisabled();
});
it("cancels disable without sending a request", () => {
  render(<TrustedSourceList {...props} />); fireEvent.click(screen.getByRole("button", { name: "Disable" })); fireEvent.click(within(screen.getByRole("dialog", { hidden: true })).getByRole("button", { name: "Cancel", hidden: true })); expect(deleteTrustedSource).not.toHaveBeenCalled();
});
