# Proof sharing lifecycle (API v1)

The proof-sharing workspace uses the authenticated versioned `share-links`
and `access-summary` routes in `lib/api/openapi/earnproof-api.v1.json`.
The backend must implement these contracts and enforce proof ownership on
every request. This frontend does not implement or simulate those server routes.
An unavailable, unauthorized, malformed or unsupported response is an error;
there is no browser-local fallback and legacy local links are not migrated into
server trust. Reauthenticate after a document reload, then refresh the server list.
A second device observes the same lifecycle after authenticating.

Creation sends an Idempotency-Key. Repeating an interrupted request with the same
policy reuses the key; changing the policy creates another intent. The server
must associate keys with the authenticated principal and payload, reject payload
changes with 409, and never reveal a raw token again on replay. A lost creation
response requires checking the list and revoking/replacing the link if necessary.
Mutations are never automatically retried. DELETE is idempotent. Revocation and
expiry enforcement belong on the server, including redemption in other clients.

Only the immediate creation response can contain a token. The token is held in
component memory until dismissed, expired, unmounted or auth scope changes. It
does not enter browser storage, query caches, URLs, logs or access summaries.
List and summary responses are allowlisted with runtime schemas; extra fields
are stripped. Summary fields contain counts and coarse outcomes only.

All requests support cancellation. Auth/proof changes remount the workspace and
abort outstanding requests. A newer refresh cancels the preceding read. Loading
and failure clear old usability state; revocation clears both the list and any
token reveal before the network request. Expiry is inclusive (`now >= expiresAt`)
and re-evaluated every second. Focus refreshes the server list. Announcements use
status/alert roles and controls have accessible labels and pending-state guards.

Validation: focused Jest/React Testing Library suites for the server store and
panel; `npm run lint`, `npm test -- --runInBand`, `npm run build`, and
`npm run test:contracts`. All fixtures are synthetic.

# Frontend integration status

This PR is frontend-only. The share-link lifecycle routes in its versioned
fixture define the required integration contract; they are not evidence of a
deployed backend. The backend `develop` branch inspected on November 18 exposes
`POST /proofs/:id/sharing-token` and `GET /proofs/sharing-access`, but lacks
authoritative per-link listing/revocation and the disclosure policy contract.
Those legacy routes cannot safely emulate the required lifecycle. Until the
matching API is available, the UI reports an error and never falls back to local
links or reports successful revocation. Tests use synthetic API fixtures and
validate frontend behavior; end-to-end deployment remains a backend dependency.
