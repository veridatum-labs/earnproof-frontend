import { extractProofId } from "@/lib/validation/proof-input";

describe("extractProofId", () => {
  it("extracts raw proof IDs", () => {
    expect(extractProofId(" ep_7F3A ")).toBe("ep_7F3A");
  });

  it("extracts supported verification links", () => {
    expect(extractProofId("http://localhost:3000/verify?proof=ep_7F3A")).toBe(
      "ep_7F3A",
    );
    expect(extractProofId("https://app.example.com/verify/ep_7F3A")).toBe(
      "ep_7F3A",
    );
  });

  it("rejects unrelated URLs and malformed input", () => {
    expect(extractProofId("https://app.example.com/proofs/ep_7F3A")).toBeNull();
    expect(
      extractProofId("https://app.example.com/verify?proof=not%20a%20proof"),
    ).toBeNull();
    expect(extractProofId("javascript:alert(1)")).toBeNull();
    expect(extractProofId("")).toBeNull();
  });
});
