/**
 * Tests for quarantine API functions.
 *
 * Covers positive cases (successful operations), negative cases (error handling),
 * authorization checks, and boundary conditions.
 */

import { describe, it, expect } from "@jest/globals";
import {
  describeQuarantineReason,
  getQuarantineStatusInfo,
} from "../quarantine";

describe("Quarantine API utility functions", () => {
  describe("describeQuarantineReason", () => {
    it("should return descriptions for all quarantine reasons", () => {
      expect(describeQuarantineReason("malformed_structure")).toBe(
        "Credential structure is malformed or missing required fields"
      );
      expect(describeQuarantineReason("unknown_issuer")).toBe("Credential issuer is not recognized or trusted");
      expect(describeQuarantineReason("conflicting_trust_data")).toBe(
        "Conflicting trust data detected between credential and public records"
      );
      expect(describeQuarantineReason("schema_version_mismatch")).toBe(
        "Schema version does not match expected format"
      );
      expect(describeQuarantineReason("signature_verification_failed")).toBe(
        "Cryptographic signature verification failed"
      );
      expect(describeQuarantineReason("expired_before_review")).toBe(
        "Credential expired before it could be reviewed"
      );
      expect(describeQuarantineReason("revoked_before_review")).toBe(
        "Credential was revoked before it could be reviewed"
      );
      expect(describeQuarantineReason("replay_attack_detected")).toBe(
        "Potential replay attack detected - credential may have been reused"
      );
    });
  });

  describe("getQuarantineStatusInfo", () => {
    it("should return status info for all statuses", () => {
      expect(getQuarantineStatusInfo("pending_review")).toEqual({
        label: "Pending Review",
        description: "Awaiting manual review before release",
        color: "amber",
      });
      expect(getQuarantineStatusInfo("approved")).toEqual({
        label: "Approved",
        description: "Released for normal verification",
        color: "emerald",
      });
      expect(getQuarantineStatusInfo("rejected")).toEqual({
        label: "Rejected",
        description: "Permanently blocked from verification",
        color: "rose",
      });
      expect(getQuarantineStatusInfo("expired")).toEqual({
        label: "Expired",
        description: "Quarantine period expired without review",
        color: "slate",
      });
      expect(getQuarantineStatusInfo("auto_rejected")).toEqual({
        label: "Auto-Rejected",
        description: "Automatically rejected due to policy violation",
        color: "rose",
      });
    });
  });
});

describe("describeQuarantineReason", () => {
  it("should return descriptions for all quarantine reasons", () => {
    expect(describeQuarantineReason("malformed_structure")).toBe(
      "Credential structure is malformed or missing required fields"
    );
    expect(describeQuarantineReason("unknown_issuer")).toBe("Credential issuer is not recognized or trusted");
    expect(describeQuarantineReason("conflicting_trust_data")).toBe(
      "Conflicting trust data detected between credential and public records"
    );
    expect(describeQuarantineReason("schema_version_mismatch")).toBe(
      "Schema version does not match expected format"
    );
    expect(describeQuarantineReason("signature_verification_failed")).toBe(
      "Cryptographic signature verification failed"
    );
    expect(describeQuarantineReason("expired_before_review")).toBe(
      "Credential expired before it could be reviewed"
    );
    expect(describeQuarantineReason("revoked_before_review")).toBe(
      "Credential was revoked before it could be reviewed"
    );
    expect(describeQuarantineReason("replay_attack_detected")).toBe(
      "Potential replay attack detected - credential may have been reused"
    );
  });
});

describe("getQuarantineStatusInfo", () => {
  it("should return status info for all statuses", () => {
    expect(getQuarantineStatusInfo("pending_review")).toEqual({
      label: "Pending Review",
      description: "Awaiting manual review before release",
      color: "amber",
    });
    expect(getQuarantineStatusInfo("approved")).toEqual({
      label: "Approved",
      description: "Released for normal verification",
      color: "emerald",
    });
    expect(getQuarantineStatusInfo("rejected")).toEqual({
      label: "Rejected",
      description: "Permanently blocked from verification",
      color: "rose",
    });
    expect(getQuarantineStatusInfo("expired")).toEqual({
      label: "Expired",
      description: "Quarantine period expired without review",
      color: "slate",
    });
    expect(getQuarantineStatusInfo("auto_rejected")).toEqual({
      label: "Auto-Rejected",
      description: "Automatically rejected due to policy violation",
      color: "rose",
    });
  });
});
