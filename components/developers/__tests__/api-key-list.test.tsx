/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiKeyList } from "../api-key-list";
import * as keysApi from "@/lib/api/keys";
import type { ApiKey } from "@/lib/api/generated/v1";

// Mock the OneTimeSecret component to simplify testing
jest.mock("../one-time-secret", () => ({
  OneTimeSecret: ({ apiKey, secret, onDismiss }: any) => (
    <div data-testid="one-time-secret">
      <div>{apiKey.name} - Secret shown</div>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  ),
}));

// Mock the ConfirmationDialog component
jest.mock("@/components/common/confirmation-dialog", () => ({
  ConfirmationDialog: ({ onConfirm, onCancel, message }: any) => (
    <div data-testid="confirmation-dialog">
      <p>{message}</p>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

const mockApiKey: ApiKey = {
  id: "key_123",
  name: "Test API Key",
  prefix: "ep_test_abc123",
  scopes: ["verification:read", "proofs:create"],
  expiresAt: "2026-12-31T12:00:00.000Z",
};

const mockExpiredApiKey: ApiKey = {
  id: "key_expired",
  name: "Expired API Key",
  prefix: "ep_expired_xyz",
  scopes: ["verification:read"],
  expiresAt: "2026-01-01T12:00:00.000Z",
};

const mockExpiringApiKey: ApiKey = {
  id: "key_expiring",
  name: "Expiring API Key",
  prefix: "ep_expiring_123",
  scopes: ["proofs:create"],
  expiresAt: "2026-09-24T12:00:00.000Z", // Tomorrow (1 day from now)
};

const mockToken = "test_token_123";

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-23T12:00:00.000Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ApiKeyList", () => {
  describe("rendering and display", () => {
    it("displays loading state when loading with no keys", () => {
      render(
        <ApiKeyList
          apiKeys={[]}
          loading={true}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.getByText("Loading API keys...")).toBeInTheDocument();
    });

    it("displays empty state when no keys exist", () => {
      render(
        <ApiKeyList
          apiKeys={[]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.getByText("No API keys found. Create your first API key above.")).toBeInTheDocument();
    });

    it("displays valid API keys", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("ep_test_abc123***")).toBeInTheDocument();
    });

    it("does not display expired keys in main list", () => {
      render(
        <ApiKeyList
          apiKeys={[mockExpiredApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      // Should show the expired keys section instead
      expect(screen.getByText("Expired API Keys")).toBeInTheDocument();
      expect(
        screen.getByText(
          "These API keys have expired and can no longer be used. Rotate or revoke them, or create a new key."
        )
      ).toBeInTheDocument();
    });

    it("displays both valid and expired keys when mixed", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey, mockExpiredApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.getByText("Test API Key")).toBeInTheDocument();
      expect(screen.getByText("Expired API Keys")).toBeInTheDocument();
      expect(screen.getByText("Expired API Key")).toBeInTheDocument();
    });

    it("shows expiration warning for keys expiring soon", () => {
      render(
        <ApiKeyList
          apiKeys={[mockExpiringApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.getByText("Expiring very soon")).toBeInTheDocument();
    });

    it("displays exact time and relative time for expiration", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const expirationDisplay = screen.getByText(/Dec 31, 2026 — in/);
      expect(expirationDisplay).toBeInTheDocument();
    });

    it("displays 'Never' for keys with no expiration", () => {
      const noExpiryKey: ApiKey = {
        ...mockApiKey,
        expiresAt: null,
      };

      render(
        <ApiKeyList
          apiKeys={[noExpiryKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.getByText("Never")).toBeInTheDocument();
    });
  });

  describe("rotation functionality", () => {
    it("shows confirmation dialog when rotate button is clicked", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to rotate "Test API Key"\?/)
      ).toBeInTheDocument();
    });

    it("calls rotateApiKey when confirmed", async () => {
      const rotateSpy = jest.spyOn(keysApi, "rotateApiKey").mockResolvedValue({
        apiKey: mockApiKey,
        secret: "new_secret_123",
      });

      const onKeyUpdated = jest.fn();

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={onKeyUpdated}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(rotateSpy).toHaveBeenCalledWith(mockToken, "key_123", expect.any(AbortSignal));
      });

      expect(onKeyUpdated).toHaveBeenCalledWith(mockApiKey);
    });

    it("displays one-time secret after successful rotation", async () => {
      jest.spyOn(keysApi, "rotateApiKey").mockResolvedValue({
        apiKey: mockApiKey,
        secret: "new_secret_123",
      });

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByTestId("one-time-secret")).toBeInTheDocument();
        expect(screen.getByText(/Test API Key - Secret shown/)).toBeInTheDocument();
      });
    });

    it("dismisses one-time secret when dismiss button is clicked", async () => {
      jest.spyOn(keysApi, "rotateApiKey").mockResolvedValue({
        apiKey: mockApiKey,
        secret: "new_secret_123",
      });

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByTestId("one-time-secret")).toBeInTheDocument();
      });

      const dismissButton = screen.getByText("Dismiss");
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByTestId("one-time-secret")).not.toBeInTheDocument();
      });
    });

    it("handles rotation error gracefully", async () => {
      const errorMessage = "Failed to rotate API key";
      jest.spyOn(keysApi, "rotateApiKey").mockRejectedValue(new Error(errorMessage));

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("Failed to rotate API key. Please try again.")).toBeInTheDocument();
      });
    });

    it("can rotate expired keys", async () => {
      const rotateSpy = jest.spyOn(keysApi, "rotateApiKey").mockResolvedValue({
        apiKey: mockExpiredApiKey,
        secret: "new_secret_123",
      });

      const onKeyUpdated = jest.fn();

      render(
        <ApiKeyList
          apiKeys={[mockExpiredApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={onKeyUpdated}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getByText("Rotate");
      fireEvent.click(rotateButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(rotateSpy).toHaveBeenCalled();
      });

      expect(onKeyUpdated).toHaveBeenCalledWith(mockExpiredApiKey);
    });
  });

  describe("revoke functionality", () => {
    it("shows confirmation dialog when revoke button is clicked", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const revokeButton = screen.getAllByText("Revoke")[0];
      fireEvent.click(revokeButton);

      expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to revoke "Test API Key"\?/)
      ).toBeInTheDocument();
    });

    it("calls revokeApiKey when confirmed", async () => {
      const revokeSpy = jest.spyOn(keysApi, "revokeApiKey").mockResolvedValue(undefined);
      const onKeyRevoked = jest.fn();

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={onKeyRevoked}
        />
      );

      const revokeButton = screen.getAllByText("Revoke")[0];
      fireEvent.click(revokeButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(revokeSpy).toHaveBeenCalledWith(mockToken, "key_123", expect.any(AbortSignal));
      });

      expect(onKeyRevoked).toHaveBeenCalledWith("key_123");
    });

    it("handles revoke error gracefully", async () => {
      jest.spyOn(keysApi, "revokeApiKey").mockRejectedValue(new Error("Revoke failed"));

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const revokeButton = screen.getAllByText("Revoke")[0];
      fireEvent.click(revokeButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("Failed to revoke API key. Please try again.")).toBeInTheDocument();
      });
    });
  });

  describe("cancellation", () => {
    it("closes confirmation dialog when cancel is clicked", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();

      const cancelButton = screen.getAllByText("Cancel")[0];
      fireEvent.click(cancelButton);

      expect(screen.queryByTestId("confirmation-dialog")).not.toBeInTheDocument();
    });
  });

  describe("expiration status with fake timers", () => {
    it("updates expiration warning as time progresses", () => {
      const { rerender } = render(
        <ApiKeyList
          apiKeys={[mockExpiringApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      // Initially expires tomorrow (very soon)
      expect(screen.getByText("Expiring very soon")).toBeInTheDocument();

      // Advance time by 1 day (now expired)
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);

      rerender(
        <ApiKeyList
          apiKeys={[mockExpiringApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      // Should now show expired and move to expired keys section
      expect(screen.getByText("Expired API Keys")).toBeInTheDocument();
    });

    it("shows key as valid when expiration is far in future", () => {
      const futureKey: ApiKey = {
        ...mockApiKey,
        expiresAt: "2027-12-31T12:00:00.000Z",
      };

      render(
        <ApiKeyList
          apiKeys={[futureKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(screen.queryByText("Expiring soon")).not.toBeInTheDocument();
      expect(screen.queryByText("Expiring very soon")).not.toBeInTheDocument();
      expect(screen.queryByText("Expired")).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("includes aria-labels on action buttons", () => {
      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButtons = screen.getAllByLabelText(/Rotate API key/);
      const revokeButtons = screen.getAllByLabelText(/Revoke API key/);

      expect(rotateButtons.length).toBeGreaterThan(0);
      expect(revokeButtons.length).toBeGreaterThan(0);
    });

    it("includes aria-live region for expiration status", () => {
      render(
        <ApiKeyList
          apiKeys={[mockExpiringApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const expirationDisplay = screen.getByText(/Sep 24, 2026 — in/);
      expect(expirationDisplay).toHaveAttribute("role", "status");
      expect(expirationDisplay).toHaveAttribute("aria-live", "polite");
    });

    it("includes error alert role for error messages", async () => {
      jest.spyOn(keysApi, "rotateApiKey").mockRejectedValue(new Error("Error"));

      render(
        <ApiKeyList
          apiKeys={[mockApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      const rotateButton = screen.getAllByText("Rotate")[0];
      fireEvent.click(rotateButton);

      const confirmButton = screen.getAllByText("Confirm")[0];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        const alert = screen.getByRole("alert");
        expect(alert).toBeInTheDocument();
      });
    });
  });

  describe("expired all keys message", () => {
    it("shows special message when all keys are expired", () => {
      render(
        <ApiKeyList
          apiKeys={[mockExpiredApiKey]}
          loading={false}
          token={mockToken}
          onKeyUpdated={jest.fn()}
          onKeyRevoked={jest.fn()}
        />
      );

      expect(
        screen.getByText(
          "All API keys have expired. Create a new key or rotate an existing key to continue using the API."
        )
      ).toBeInTheDocument();
    });
  });
});
