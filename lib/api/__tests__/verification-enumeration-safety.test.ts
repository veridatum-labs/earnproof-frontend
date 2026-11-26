import {
  ENUMERATION_SAFE_VERIFICATION_MESSAGE,
  ENUMERATION_SENSITIVE_STATUSES,
  normalizeVerificationError,
  createEnumerationSafeApiError,
} from "../verification-enumeration-safety";
import { ApiError } from "../../errors/types";

describe("verification-enumeration-safety", () => {
  describe("normalizeVerificationError", () => {
    it.each([400, 401, 403, 404, 422, 429])(
      "returns uniform enumeration-safe message for sensitive status %i",
      (status) => {
        const error = new ApiError({
          status,
          message: `Internal reason for status ${status}`,
          requestId: "req_123",
          correlationId: "corr_456",
        });

        const normalized = normalizeVerificationError(error);

        expect(normalized.message).toBe(ENUMERATION_SAFE_VERIFICATION_MESSAGE);
        expect(normalized.isEnumerationSafe).toBe(true);
        expect(normalized.requestId).toBe("req_123");
        expect(normalized.correlationId).toBe("corr_456");
      }
    );

    it("marks 429 rate limit correctly", () => {
      const error = new ApiError({
        status: 429,
        message: "Rate limit exceeded",
        requestId: "req_rate",
      });

      const normalized = normalizeVerificationError(error);

      expect(normalized.message).toBe(ENUMERATION_SAFE_VERIFICATION_MESSAGE);
      expect(normalized.isRateLimited).toBe(true);
      expect(normalized.isEnumerationSafe).toBe(true);
      expect(normalized.requestId).toBe("req_rate");
    });

    it("handles 500 server errors with server error message and preserves references", () => {
      const error = new ApiError({
        status: 500,
        message: "Internal server error",
        requestId: "req_500",
      });

      const normalized = normalizeVerificationError(error);

      expect(normalized.message).toBe("Server error occurred during verification. Please try again later.");
      expect(normalized.isEnumerationSafe).toBe(false);
      expect(normalized.isRateLimited).toBe(false);
      expect(normalized.requestId).toBe("req_500");
    });

    it("normalizes string error containing 404 or not found", () => {
      const normalized = normalizeVerificationError("Request failed with 404: Proof not found");

      expect(normalized.message).toBe(ENUMERATION_SAFE_VERIFICATION_MESSAGE);
      expect(normalized.isEnumerationSafe).toBe(true);
      expect(normalized.statusCode).toBe(404);
    });

    it("normalizes unauthorized string error without exposing existence", () => {
      const normalized = normalizeVerificationError("401 Unauthorized access to protected resource");

      expect(normalized.message).toBe(ENUMERATION_SAFE_VERIFICATION_MESSAGE);
      expect(normalized.isEnumerationSafe).toBe(true);
    });

    it("handles timeout error gracefully", () => {
      const normalized = normalizeVerificationError(new Error("Request timed out"));

      expect(normalized.message).toBe("Request timed out. Please check your connection and try again.");
      expect(normalized.isEnumerationSafe).toBe(false);
    });

    it("handles generic unknown error", () => {
      const normalized = normalizeVerificationError({});

      expect(normalized.message).toBe("Unable to verify proof. Please check your connection and try again.");
      expect(normalized.isEnumerationSafe).toBe(false);
    });
  });

  describe("createEnumerationSafeApiError", () => {
    it("creates an ApiError with enumeration-safe message and preserves metadata", () => {
      const apiError = createEnumerationSafeApiError({
        status: 404,
        requestId: "req_test",
        correlationId: "corr_test",
      });

      expect(apiError).toBeInstanceOf(ApiError);
      expect(apiError.message).toBe(ENUMERATION_SAFE_VERIFICATION_MESSAGE);
      expect(apiError.status).toBe(404);
      expect(apiError.requestId).toBe("req_test");
      expect(apiError.correlationId).toBe("corr_test");
    });
  });
});
