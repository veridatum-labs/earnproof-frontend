import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateTrustedSourceForm } from "../create-trusted-source-form";
import { createTrustedSource } from "@/lib/trusted-sources/store";
jest.mock("@/lib/trusted-sources/store", () => ({ createTrustedSource: jest.fn(async (_userId: string, input: { name: string; issuerId: string }) => ({ ...input, id: "source-1", organizationId: "org-1", network: "testnet", status: "ACTIVE", version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" })) }));

const USER_ID = "user-1";
const ISSUERS = [
  { id: "iss-1", name: "Acme Issuer", status: "ACTIVE" as const },
  { id: "iss-2", name: "Beta Issuer", status: "ACTIVE" as const },
];

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});

it("blocks another creation after an ambiguous server failure until refresh remounts the form", async () => {
  jest.mocked(createTrustedSource).mockRejectedValueOnce(new Error("Disconnected after send"));
  const created = jest.fn();
  render(<CreateTrustedSourceForm userId={USER_ID} issuers={ISSUERS} onTrustedSourceCreated={created} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Synthetic payroll" } });
  fireEvent.change(screen.getByLabelText("Linked issuer"), { target: { value: "iss-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Add trusted source" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));
  expect(createTrustedSource).toHaveBeenCalledTimes(1);
  expect(created).not.toHaveBeenCalled();
});

describe("CreateTrustedSourceForm", () => {
  it("creates a trusted source and calls onTrustedSourceCreated", async () => {
    const onCreated = jest.fn();
    render(
      <CreateTrustedSourceForm
        userId={USER_ID}
        issuers={ISSUERS}
        onTrustedSourceCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Acme Payroll" },
    });
    fireEvent.change(screen.getByLabelText("Linked issuer"), {
      target: { value: "iss-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Acme Payroll", issuerId: "iss-1" }),
      );
    });
  });

  it("rejects submission with no name (negative case)", async () => {
    const onCreated = jest.fn();
    render(
      <CreateTrustedSourceForm
        userId={USER_ID}
        issuers={ISSUERS}
        onTrustedSourceCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Linked issuer"), {
      target: { value: "iss-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects submission with no issuer selected (negative case)", async () => {
    const onCreated = jest.fn();
    render(
      <CreateTrustedSourceForm
        userId={USER_ID}
        issuers={ISSUERS}
        onTrustedSourceCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Acme Payroll" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));

    await waitFor(() => {
      expect(screen.getByText("An issuer must be selected")).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a name shorter than the minimum length (boundary case)", async () => {
    const onCreated = jest.fn();
    render(
      <CreateTrustedSourceForm
        userId={USER_ID}
        issuers={ISSUERS}
        onTrustedSourceCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Linked issuer"), {
      target: { value: "iss-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));

    await waitFor(() => {
      expect(onCreated).not.toHaveBeenCalled();
    });
  });

  it("disables submission and shows a disabled-state message when there are no issuers to link", () => {
    render(
      <CreateTrustedSourceForm
        userId={USER_ID}
        issuers={[]}
        onTrustedSourceCreated={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Add trusted source" })).toBeDisabled();
    expect(screen.getByText("No issuers available")).toBeInTheDocument();
  });

  it("clears the form after a successful submission", async () => {
    render(
      <CreateTrustedSourceForm
        userId={USER_ID}
        issuers={ISSUERS}
        onTrustedSourceCreated={jest.fn()}
      />,
    );

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Acme Payroll" } });
    fireEvent.change(screen.getByLabelText("Linked issuer"), {
      target: { value: "iss-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add trusted source" }));

    await waitFor(() => expect(nameInput.value).toBe(""));
  });
});
