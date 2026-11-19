# Trusted-source registry (API v1)

This is frontend-only integration work. The routes below are the required client
contract, not a claim that they exist on the current backend. Backend `develop`
inspected November 18 provides user-scoped `/trusted-sources` CRUD with
`expectedRevision`, not organization-scoped disable/test/history/network
operations. That API cannot safely emulate tenant-wide trust. Until matching
endpoints are available, failed reads block creation and expose no trusted local
registry. Synthetic API tests cover the client contract; deployed end-to-end
behavior remains a backend dependency. No backend source is changed here.

The workspace now uses organization-scoped list/create/update/disable/test/history
routes under `/organizations/{organizationId}/trusted-sources`, defined in the
versioned OpenAPI fixture. Backend deployment support is required. The server
must authorize tenant membership and administrative/issuer roles on every route,
validate live issuer ownership/status and network, and enforce version checks.
The frontend never simulates successful writes when a route is unavailable.

Browser registry records are ignored; there is no automatic migration or local
fallback. A selected organization ID is a routing hint, never an authorization
decision. Responses are validated and extra fields stripped. Another organization,
issuer substitution, a network mismatch, malformed data or an unexpected version
fails closed. Disabled/deleted records are ineligible; deleted rows are excluded.

Edits and disable actions capture the displayed version and send quoted If-Match.
409/412 requires refreshing/reviewing server state before retrying. Mutations are
not automatically retried and UI pending guards prevent duplicate submissions.
An interrupted creation must be reconciled by refreshing before another attempt.
Disable is the compatibility replacement for the previous browser-only delete.
Only a confirmed disabled/deleted server response removes the row.

Tests and history are authenticated server results, never inferred from browser
configuration. Diagnostics render only an eligibility boolean, timestamps and
allowlisted history action/version fields. No endpoint credentials are stored in
this registry. Tenant changes notify subscribers, remount the workspace, discard
old state and abort outstanding requests. Late results cannot update the new
tenant. Failed refreshes remove stale source rows. Controls have pending states,
labels and alert/status announcements; disable retains confirmation and focus
restoration.

Validation: scoped Jest/RTL suites, `npm run lint`, `npm test -- --runInBand`,
`npm run build`, and `npm run test:contracts`. All fixtures are synthetic.
