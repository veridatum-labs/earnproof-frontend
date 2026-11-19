import { render, screen } from "@testing-library/react";
import { WalletRotationManagement } from "../wallet-rotation-management";
import { storeSession, resetSessionForTests } from "@/lib/session";
import { CURRENT, makeIntent } from "@/tests/fixtures/wallet-rotation-api";
jest.mock("@/lib/wallet-rotation/store", () => ({ ...jest.requireActual("@/lib/wallet-rotation/store"), getRotationIntent: jest.fn(async () => makeIntent()) }));


beforeEach(() => {
  window.localStorage.clear();
  resetSessionForTests();
});

describe("WalletRotationManagement", () => {
  it("shows an authentication prompt when there is no session", () => {
    render(<WalletRotationManagement />);

    expect(screen.getByText("Authentication Required")).toBeInTheDocument();
  });

  it("renders the rotation flow for an authenticated session", async () => {
    storeSession({
        token: "tok",
        user: { id: "u1", walletAddress: CURRENT, walletHash: "synthetic-hash", role: "WORKER" },
      });

    render(<WalletRotationManagement />);

    expect(screen.getByText("Rotate Wallet Address")).toBeInTheDocument();
    expect(await screen.findByText(/Current wallet:/)).toHaveTextContent(CURRENT.slice(0, 6));
  });
});
