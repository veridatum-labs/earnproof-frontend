import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WalletRotationFlow } from "../wallet-rotation-flow";
import { getRotationIntent, createRotationIntent, createRotationChallenge, submitRotationProof, completeWalletRotation, cancelRotationIntent } from "@/lib/wallet-rotation/store";
import { connectFreighterWallet, signFreighterMessage } from "@/lib/wallet/freighter-sign";
import { clearStoredSession } from "@/lib/session";
import { clearAllStorage } from "@/lib/storage";
import { CURRENT, REPLACEMENT, makeIntent, makeProof, makeChallenge } from "@/tests/fixtures/wallet-rotation-api";
jest.mock("@/lib/wallet-rotation/store", () => ({ ...jest.requireActual("@/lib/wallet-rotation/store"), getRotationIntent: jest.fn(), createRotationIntent: jest.fn(), createRotationChallenge: jest.fn(), submitRotationProof: jest.fn(), completeWalletRotation: jest.fn(), cancelRotationIntent: jest.fn() }));
jest.mock("@/lib/wallet/freighter-sign", () => ({ connectFreighterWallet: jest.fn(), signFreighterMessage: jest.fn() }));
jest.mock("@/lib/session", () => ({ clearStoredSession: jest.fn() }));
jest.mock("@/lib/storage", () => ({ clearAllStorage: jest.fn() }));
const ready = () => makeIntent({ status: "READY", version: 3, currentProof: makeProof("current"), replacementProof: makeProof("replacement") });
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(getRotationIntent).mockResolvedValue(makeIntent()); jest.mocked(createRotationIntent).mockResolvedValue(makeIntent());
  jest.mocked(createRotationChallenge).mockImplementation(async (_intent, role) => makeChallenge(role));
  jest.mocked(submitRotationProof).mockImplementation(async (intent, challenge) => challenge.role === "current" ? { ...intent, version: 2, currentProof: makeProof("current") } : ready());
  jest.mocked(signFreighterMessage).mockResolvedValue("synthetic-signature"); jest.mocked(cancelRotationIntent).mockResolvedValue();
  jest.mocked(completeWalletRotation).mockResolvedValue({ ...ready(), status: "COMPLETED", version: 4, completedAt: "2026-11-18T00:00:00.000Z" });
});
it("recovers both server proofs after navigation without signing again", async () => {
  jest.mocked(getRotationIntent).mockResolvedValue(ready()); render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={jest.fn()} />);
  await screen.findByRole("button", { name: "Current wallet verified" }); expect(screen.getByRole("button", { name: "Replacement wallet verified" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Confirm rotation" })).toBeEnabled(); expect(signFreighterMessage).not.toHaveBeenCalled();
});
it("requires both wallet proofs and server completion before logout or success", async () => {
  const done = jest.fn(); jest.mocked(connectFreighterWallet).mockResolvedValueOnce(CURRENT).mockResolvedValueOnce(REPLACEMENT);
  render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={done} />);
  fireEvent.click(await screen.findByRole("button", { name: "Verify current wallet" })); await screen.findByRole("button", { name: "Current wallet verified" });
  fireEvent.click(screen.getByRole("button", { name: "Verify replacement wallet" })); await screen.findByRole("button", { name: "Replacement wallet verified" });
  expect(done).not.toHaveBeenCalled(); expect(clearStoredSession).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm rotation" })); await waitFor(() => expect(done).toHaveBeenCalledWith(REPLACEMENT)); expect(clearStoredSession).toHaveBeenCalledWith("wallet_changed"); expect(clearAllStorage).toHaveBeenCalled();
});
it("keeps ambiguous completion failures blocked until server recovery", async () => {
  jest.mocked(getRotationIntent).mockResolvedValue(ready()); jest.mocked(completeWalletRotation).mockRejectedValue(new Error("Conflict")); const done = jest.fn(); render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={done} />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirm rotation" })); await screen.findByRole("alert"); expect(done).not.toHaveBeenCalled(); expect(clearStoredSession).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Confirm rotation" })).toBeDisabled();
  jest.mocked(getRotationIntent).mockResolvedValue(null); fireEvent.click(screen.getByRole("button", { name: "Refresh rotation state" })); await screen.findByRole("button", { name: "Start rotation" });
});
it("does not submit a proof after the wallet rejects signing", async () => {
  jest.mocked(connectFreighterWallet).mockResolvedValue(CURRENT); jest.mocked(signFreighterMessage).mockResolvedValue(null); render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Verify current wallet" })); await screen.findByRole("alert"); expect(submitRotationProof).not.toHaveBeenCalled();
});
it("creates a new server intent rather than recording local reassignment", async () => {
  jest.mocked(getRotationIntent).mockResolvedValue(null); render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={jest.fn()} />);
  fireEvent.change(await screen.findByLabelText("Replacement wallet address"), { target: { value: REPLACEMENT } }); fireEvent.click(screen.getByRole("button", { name: "Start rotation" })); await screen.findByRole("button", { name: "Verify current wallet" });
  expect(createRotationIntent).toHaveBeenCalledWith(CURRENT, REPLACEMENT, expect.any(String), expect.any(AbortSignal)); expect(clearStoredSession).not.toHaveBeenCalled();
});
it("cancels through the server before showing a new intent form", async () => {
  render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={jest.fn()} />); fireEvent.click(await screen.findByRole("button", { name: "Cancel rotation" })); await screen.findByRole("button", { name: "Start rotation" }); expect(cancelRotationIntent).toHaveBeenCalledWith(makeIntent(), expect.any(AbortSignal));
});
it("aborts recovery on unmount and prevents late wallet prompts from sending proofs", async () => {
  let connect!: (value: string) => void; jest.mocked(connectFreighterWallet).mockImplementationOnce(() => new Promise(resolve => { connect = resolve; }));
  const view = render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={jest.fn()} />); fireEvent.click(await screen.findByRole("button", { name: "Verify current wallet" })); const signal = jest.mocked(getRotationIntent).mock.calls[0][1]; view.unmount(); expect(signal?.aborted).toBe(true); connect(CURRENT); await waitFor(() => expect(createRotationChallenge).not.toHaveBeenCalled());
});
it("disables completion when a recovered proof has expired", async () => {
  jest.mocked(getRotationIntent).mockResolvedValue({ ...ready(), currentProof: { ...makeProof("current"), expiresAt: "2000-01-01T00:00:00.000Z" } }); render(<WalletRotationFlow currentWalletAddress={CURRENT} onRotationCompleted={jest.fn()} />); expect(await screen.findByRole("button", { name: "Confirm rotation" })).toBeDisabled();
});
