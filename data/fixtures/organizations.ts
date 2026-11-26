/**
 * Synthetic fixtures for organization testing
 *
 * Provides comprehensive test data for positive, negative, boundary,
 * and regression test cases without exposing production data.
 */

import type { Organization } from "@/lib/api/generated/v1";
import type { OrganizationWithRevision } from "@/lib/api/revision-tracking";

/**
 * Helper to create an organization fixture with sensible defaults
 */
export function makeOrganization(
  overrides?: Partial<Organization>
): Organization {
  const now = new Date();
  return {
    id: "org-" + Math.random().toString(36).slice(2, 9),
    name: "Acme Corporation",
    slug: "acme",
    status: "ACTIVE",
    website: "https://acme.example.com",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create an organization with revision tracking
 */
export function makeOrganizationWithRevision(
  overrides?: Partial<OrganizationWithRevision>
): OrganizationWithRevision {
  const org = makeOrganization(overrides);
  return {
    ...org,
    __revision: "hash-" + Math.random().toString(36).slice(2, 9),
    __loadedAt: new Date().toISOString(),
  } as OrganizationWithRevision;
}

/**
 * Fixture: Organization with valid creation date
 * Used for positive tests
 */
export const organizationWithValidCreatedAt = makeOrganization({
  id: "org-valid-date",
  name: "Valid Date Corp",
  slug: "valid-date-corp",
  createdAt: new Date("2024-06-15T10:30:00Z").toISOString(),
});

/**
 * Fixture: Organization without creation date (null)
 * Used for unavailable state testing
 */
export const organizationWithoutCreatedAt = makeOrganization({
  id: "org-no-date",
  name: "No Date Corp",
  slug: "no-date-corp",
  createdAt: null,
});

/**
 * Fixture: Organization with undefined creation date
 * Used for undefined/missing field testing
 */
export const organizationWithUndefinedCreatedAt = makeOrganization({
  id: "org-undefined-date",
  name: "Undefined Date Corp",
  slug: "undefined-date-corp",
  createdAt: undefined,
});

/**
 * Fixture: Organization with invalid creation date (invalid ISO string)
 * Used for malformed date testing
 */
export const organizationWithInvalidCreatedAt = makeOrganization({
  id: "org-invalid-date",
  name: "Invalid Date Corp",
  slug: "invalid-date-corp",
  createdAt: "not-a-date",
});

/**
 * Fixture: Organization with future creation date
 * Used for boundary/sanity check testing
 */
export const organizationWithFutureCreatedAt = makeOrganization({
  id: "org-future-date",
  name: "Future Date Corp",
  slug: "future-date-corp",
  createdAt: new Date(Date.now() + 86400000).toISOString(), // +1 day
});

/**
 * Fixture: Organization with very old creation date
 * Used for boundary testing (old dates should still format correctly)
 */
export const organizationWithOldCreatedAt = makeOrganization({
  id: "org-old-date",
  name: "Old Date Corp",
  slug: "old-date-corp",
  createdAt: new Date("2020-01-01T00:00:00Z").toISOString(),
});

/**
 * Fixture: Organization with recent creation date
 * Used for relative time testing
 */
export const organizationWithRecentCreatedAt = makeOrganization({
  id: "org-recent-date",
  name: "Recent Date Corp",
  slug: "recent-date-corp",
  createdAt: new Date(Date.now() - 3600000).toISOString(), // -1 hour
});

/**
 * Fixture: Pending organization with creation date
 * Used for status + date combination testing
 */
export const pendingOrganizationWithCreatedAt = makeOrganization({
  id: "org-pending",
  name: "Pending Corp",
  slug: "pending-corp",
  status: "PENDING",
  createdAt: new Date("2024-11-01T14:30:00Z").toISOString(),
});

/**
 * Fixture: Suspended organization with creation date
 * Used for status + date combination testing
 */
export const suspendedOrganizationWithCreatedAt = makeOrganization({
  id: "org-suspended",
  name: "Suspended Corp",
  slug: "suspended-corp",
  status: "SUSPENDED",
  createdAt: new Date("2024-09-15T09:00:00Z").toISOString(),
});

/**
 * Fixture: Revoked organization with creation date
 * Used for status + date combination testing
 */
export const revokedOrganizationWithCreatedAt = makeOrganization({
  id: "org-revoked",
  name: "Revoked Corp",
  slug: "revoked-corp",
  status: "REVOKED",
  createdAt: new Date("2024-03-20T16:45:00Z").toISOString(),
});

/**
 * Fixture: Collection of organizations for sorting tests
 */
export const organizationsForSorting = [
  makeOrganization({
    id: "org-sort-1",
    name: "Zebra Inc",
    slug: "zebra-inc",
    createdAt: new Date("2024-12-01T10:00:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-sort-2",
    name: "Alpha Ltd",
    slug: "alpha-ltd",
    createdAt: new Date("2024-06-15T08:30:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-sort-3",
    name: "Beta Corp",
    slug: "beta-corp",
    createdAt: new Date("2024-09-20T14:00:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-sort-4",
    name: "Gamma Ltd",
    slug: "gamma-ltd",
    createdAt: null, // Unavailable date for sorting edge case
  }),
];

/**
 * Fixture: Organization without website (optional field)
 * Used for field optional testing
 */
export const organizationWithoutWebsite = makeOrganization({
  id: "org-no-website",
  name: "No Website Corp",
  slug: "no-website-corp",
  website: undefined,
  createdAt: new Date("2024-07-10T11:15:00Z").toISOString(),
});

/**
 * Fixture: Organization with empty website string
 * Used for empty optional field testing
 */
export const organizationWithEmptyWebsite = makeOrganization({
  id: "org-empty-website",
  name: "Empty Website Corp",
  slug: "empty-website-corp",
  website: null,
  createdAt: new Date("2024-08-05T15:45:00Z").toISOString(),
});

/**
 * Fixture: Collection of organizations for list rendering tests
 */
export const organizationCollection = [
  makeOrganization({
    id: "org-list-1",
    name: "Acme Global",
    slug: "acme-global",
    status: "ACTIVE",
    website: "https://acme-global.example.com",
    createdAt: new Date("2024-11-15T09:30:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-list-2",
    name: "TechVentures",
    slug: "techventures",
    status: "ACTIVE",
    website: "https://techventures.example.com",
    createdAt: new Date("2024-10-20T13:15:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-list-3",
    name: "Legacy Systems",
    slug: "legacy-systems",
    status: "SUSPENDED",
    website: null,
    createdAt: new Date("2024-05-10T08:00:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-list-4",
    name: "NewStartup",
    slug: "newstartup",
    status: "PENDING",
    website: "https://newstartup.example.com",
    createdAt: new Date("2024-12-01T16:30:00Z").toISOString(),
  }),
  makeOrganization({
    id: "org-list-5",
    name: "Archived Org",
    slug: "archived-org",
    status: "REVOKED",
    website: null,
    createdAt: null, // Unavailable date
  }),
];
