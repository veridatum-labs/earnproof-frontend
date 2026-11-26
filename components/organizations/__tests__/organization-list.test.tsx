/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { OrganizationList } from "../organization-list";
import { updateOrganization } from "@/lib/api/organizations";
import { organizationCollection, organizationWithoutCreatedAt, organizationWithInvalidCreatedAt, makeOrganizationWithRevision } from "@/data/fixtures/organizations";
import type { Organization } from "@/lib/api/generated/v1";

jest.mock("@/lib/api/organizations", () => {
  const actual = jest.requireActual("@/lib/api/organizations");
  return {
    ...actual,
    updateOrganization: jest.fn(),
  };
});

const mockedUpdateOrganization = updateOrganization as jest.Mock;

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Acme",
    slug: "acme",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("OrganizationList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a semantic table with a column header for each field", () => {
    render(
      <OrganizationList
        organizations={[makeOrganizationWithRevision()]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /organization/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /created/i })).toBeInTheDocument();
  });

  it("renders an accessible empty state row when there are no organizations", () => {
    render(
      <OrganizationList
        organizations={[]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByText(/no organizations found/i)
    ).toBeInTheDocument();
  });

  it("renders creation date when available", () => {
    const org = makeOrganizationWithRevision({
      name: "Test Org",
      createdAt: new Date("2024-11-15T10:30:00Z").toISOString(),
    });

    render(
      <OrganizationList
        organizations={[org]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    const createdCell = screen.getByText(/Nov|November/);
    expect(createdCell).toBeInTheDocument();
  });

  it("renders 'Unavailable' when creation date is null", () => {
    const org = makeOrganizationWithRevision({
      name: "No Date Org",
      createdAt: null,
    });

    render(
      <OrganizationList
        organizations={[org]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("renders 'Unavailable' when creation date is invalid", () => {
    const org = makeOrganizationWithRevision({
      name: "Invalid Date Org",
      createdAt: "invalid-date" as any,
    });

    render(
      <OrganizationList
        organizations={[org]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("sorts rows by creation date when the Created header is activated", () => {
    const orgs = [
      makeOrganizationWithRevision({
        id: "org-1",
        name: "Created Dec",
        slug: "created-dec",
        createdAt: new Date("2024-12-15T10:00:00Z").toISOString(),
      }),
      makeOrganizationWithRevision({
        id: "org-2",
        name: "Created Jan",
        slug: "created-jan",
        createdAt: new Date("2024-01-15T10:00:00Z").toISOString(),
      }),
      makeOrganizationWithRevision({
        id: "org-3",
        name: "No Date",
        slug: "no-date",
        createdAt: null,
      }),
    ];

    render(
      <OrganizationList
        organizations={orgs}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /created/i }));

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveTextContent("Created Jan");
    expect(rows[1]).toHaveTextContent("Created Dec");
    expect(rows[2]).toHaveTextContent("No Date");
  });

  it("sorts rows by name when the Organization header is activated", () => {
    render(
      <OrganizationList
        organizations={[
          makeOrganizationWithRevision({ id: "1", name: "Zebra" }),
          makeOrganizationWithRevision({ id: "2", name: "Alpha" }),
        ]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /organization/i }));

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]).toHaveTextContent("Alpha");
    expect(rows[1]).toHaveTextContent("Zebra");
  });

  it("suspends an active organization after confirmation", async () => {
    mockedUpdateOrganization.mockResolvedValue(
      makeOrganizationWithRevision({ status: "SUSPENDED" as any })
    );
    const onOrganizationUpdated = jest.fn();

    render(
      <OrganizationList
        organizations={[makeOrganizationWithRevision()]}
        loading={false}
        token="token"
        walletAddress="wallet"
        paginationState={{ currentCursor: null, nextCursor: null, hasNext: false }}
        onPreviousPage={jest.fn()}
        onNextPage={jest.fn()}
        focusResults={false}
        onOrganizationUpdated={onOrganizationUpdated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    expect(mockedUpdateOrganization).toHaveBeenCalledWith(
      "token",
      expect.any(String),
      expect.objectContaining({ status: "SUSPENDED" }),
      expect.any(AbortSignal)
    );
  });
});
