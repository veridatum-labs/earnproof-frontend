/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArtifactExport } from "@/components/proofs/artifact-export";
import { buildCredentialExport } from "@/lib/credentials/export";
import hiddenFixture from "@/tests/exports/fixtures/hidden-credential.json";
import disclosedFixture from "@/tests/exports/fixtures/disclosed-credential.json";

describe("ArtifactExport", () => {
  const originalClipboard = navigator.clipboard;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("lists included fields and can cancel without copying", async () => {
    const user = userEvent.setup();
    render(
      <ArtifactExport
        plan={buildCredentialExport({
          credential: hiddenFixture.credential,
          proof: hiddenFixture.proof,
        })}
        title="Export credential JSON"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Export credential JSON" }));
    expect(screen.getByRole("dialog", { name: "Confirm export" })).toBeInTheDocument();
    expect(screen.getByText("credential.proof.signature")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns when optional disclosure is present", async () => {
    const user = userEvent.setup();
    render(
      <ArtifactExport
        plan={buildCredentialExport({
          credential: disclosedFixture.credential,
          proof: disclosedFixture.proof,
        })}
        title="Export credential JSON"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Export credential JSON" }));
    expect(screen.getByText(/optional amount disclosure/)).toBeInTheDocument();
    expect(screen.getByText(/optional sender or source disclosure/)).toBeInTheDocument();
  });

  it("announces clipboard denial and keeps retry available", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn().mockRejectedValue(new Error("denied")),
      },
    });
    render(
      <ArtifactExport
        plan={buildCredentialExport({
          credential: hiddenFixture.credential,
          proof: hiddenFixture.proof,
        })}
        title="Export credential JSON"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Export credential JSON" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Clipboard copy was blocked/);
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("downloads with the safe filename", async () => {
    const click = jest.fn();
    URL.createObjectURL = jest.fn(() => "blob:earnproof-export") as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn();
    const createElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = createElement(tag);
      if (tag === "a") {
        element.click = click;
      }
      return element;
    });

    const user = userEvent.setup();
    render(
      <ArtifactExport
        plan={buildCredentialExport({
          credential: hiddenFixture.credential,
          proof: hiddenFixture.proof,
        })}
        title="Export credential JSON"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Export credential JSON" }));
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(click).toHaveBeenCalled();
    expect(screen.getAllByText("Download started.")).toHaveLength(2);
  });
});
