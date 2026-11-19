/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { ShareLinkList } from "../share-link-list";
import type { ShareLinkWithStatus } from "@/lib/proof-sharing/store";
import { getShareLinkAccessSummary } from "@/lib/proof-sharing/store";
jest.mock("@/lib/proof-sharing/store", () => ({ getShareLinkAccessSummary: jest.fn() }));
const emptySummary = { shareLinkId: "share-1", status: "ACTIVE" as const, totalAttempts: 0, acceptedCount: 0, expiredCount: 0, rejectedCount: 0, recent: [], flaggedAsSuspicious: false };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(getShareLinkAccessSummary).mockResolvedValue(emptySummary); });

function link(overrides: Partial<ShareLinkWithStatus>): ShareLinkWithStatus {
  return {
    id: "share-1",
    proofId: "proof-1",
    expiresInHours: 24,
    expiresAt: "2026-06-02T00:00:00.000Z",
    discloseAmount: false,
    discloseSender: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    revokedAt: null,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("ShareLinkList", () => {
  it("shows an empty-state message when there are no links", () => {
    render(<ShareLinkList links={[]} onRevoke={jest.fn()} revokingId={null} />);
    expect(screen.getByText(/No share links have been created/i)).toBeInTheDocument();
  });

  it("visually distinguishes ACTIVE, EXPIRED, and REVOKED links", () => {
    render(
      <ShareLinkList
        links={[
          link({ id: "a", status: "ACTIVE" }),
          link({ id: "b", status: "EXPIRED" }),
          link({ id: "c", status: "REVOKED" }),
        ]}
        onRevoke={jest.fn()}
        revokingId={null}
      />,
    );

    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("EXPIRED")).toBeInTheDocument();
    expect(screen.getByText("REVOKED")).toBeInTheDocument();
  });

  it("shows a Revoke button only for ACTIVE links", () => {
    render(
      <ShareLinkList
        links={[link({ id: "a", status: "ACTIVE" }), link({ id: "b", status: "EXPIRED" })]}
        onRevoke={jest.fn()}
        revokingId={null}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Revoke/i })).toHaveLength(1);
  });

  it("calls onRevoke with the link id", () => {
    const onRevoke = jest.fn();
    render(<ShareLinkList links={[link({ id: "share-9" })]} onRevoke={onRevoke} revokingId={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Revoke/i }));
    expect(onRevoke).toHaveBeenCalledWith("share-9");
  });

  it("disables the button for the link currently being revoked", () => {
    render(<ShareLinkList links={[link({ id: "share-9" })]} onRevoke={jest.fn()} revokingId="share-9" />);
    expect(screen.getByRole("button", { name: /Revoking/i })).toBeDisabled();
  });

  it("never renders a raw token or its hash", () => {
    const record = { ...link({}), token: "super-secret-token-value", tokenHash: "super-secret-hash-value" };
    render(<ShareLinkList links={[record]} onRevoke={jest.fn()} revokingId={null} />);
    expect(screen.queryByText("super-secret-hash-value")).not.toBeInTheDocument();
    expect(screen.queryByText("super-secret-token-value")).not.toBeInTheDocument();
  });

  it("summarizes an empty disclosure policy as 'nothing extra'", () => {
    render(<ShareLinkList links={[link({})]} onRevoke={jest.fn()} revokingId={null} />);
    expect(screen.getByText("nothing extra")).toBeInTheDocument();
  });

  it("summarizes a non-empty disclosure policy", () => {
    render(
      <ShareLinkList links={[link({ discloseAmount: true, discloseSender: true })]} onRevoke={jest.fn()} revokingId={null} />,
    );
    expect(screen.getByText("amount, sender")).toBeInTheDocument();
  });

  describe("access history insights (#221)", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it("does not render access insights when userId is omitted", () => {
      render(<ShareLinkList links={[link({ id: "share-1" })]} onRevoke={jest.fn()} revokingId={null} />);
      expect(screen.queryByText(/No access attempts yet/i)).not.toBeInTheDocument();
    });

    it("renders server access insights when userId is provided", async () => {
      render(
        <ShareLinkList links={[link({ id: "share-1" })]} onRevoke={jest.fn()} revokingId={null} userId="user-1" />,
      );
      expect(await screen.findByText(/No access attempts yet/i)).toBeInTheDocument();
    });

    it("reflects server access attempts for the matching link", async () => {
      jest.mocked(getShareLinkAccessSummary).mockResolvedValue({ ...emptySummary, totalAttempts: 2, acceptedCount: 1, rejectedCount: 1 });

      render(
        <ShareLinkList links={[link({ id: "share-1" })]} onRevoke={jest.fn()} revokingId={null} userId="user-1" />,
      );

      expect(await screen.findByText(/Accepted: 1/)).toBeInTheDocument();
      expect(screen.getByText(/Rejected: 1/)).toBeInTheDocument();
    });
  });
});
