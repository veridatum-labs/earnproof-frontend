# Server wallet rotation (API v1)

This PR changes only the frontend. The contract below is the required recovery
interface, not an existing backend deployment. Backend `develop` inspected
November 18 provides `POST /auth/wallet-rotation` and
`POST /auth/wallet-rotation/:rotationId/complete`, with newline-delimited signing
messages, but no intent recovery/cancellation or durable dual-proof state API.
The client deliberately does not reinterpret that legacy protocol as this new
contract or submit general login challenges as rotation proofs. Until matching
endpoints are supplied, recovery failure blocks all mutations and never claims
reassignment. Synthetic tests establish frontend behavior only; deployed
end-to-end compatibility remains a backend dependency.

The versioned OpenAPI fixture defines intent creation, current-intent recovery,
challenge issuance, proof submission, completion and cancellation under
`/wallet-rotations`. These backend routes must be deployed; the frontend does not
simulate them. Unsupported/unauthorized/malformed responses fail closed. Existing
`earnproof.wallet-rotations` browser records are ignored and never migrate into
account identity. General `/auth/verify` sessions are not rotation proofs.

The backend owns account authorization, replacement-address conflict checks,
challenge consumption, expiry and atomic reassignment/session invalidation.
Creation carries an Idempotency-Key tied to the principal and new address/network;
an interrupted same-intent retry reuses the in-memory key. A refresh recovers the
server intent rather than reconstructing proof state from disk. Conflict/transport
failures block further mutations until an explicit recovery read succeeds.
If-Match protects every intent mutation; proof submission, cancellation and
completion advance version. Issuing a challenge does not advance intent version.
No mutation is automatically retried.

Each challenge has intentId, network, role, walletAddress, id and expiresAt.
The signed message is exactly JSON.stringify of an object with these keys in this
order (no whitespace): purpose (`earnproof.wallet-rotation.v1`), intentId, network,
role, walletAddress, challengeId (the challenge id), expiresAt. The client rejects
any different message before opening a signing prompt. The server must validate
that exact message, single-use nonce, caller/role binding and signature. Challenges
cannot outlive their intent. Proof responses must confirm the submitted challenge
and preserve its expiry. Signatures stay in short-lived function variables and are
never logged or persisted.

`READY` requires two server-verified wallet proofs. Completion checks both proof
expiries and the intent expiry at inclusive boundaries (`now >= expiry` is
expired). Only a matching, newer `COMPLETED` response with completedAt establishes
completion in the UI. This clears the in-memory old session, broadcasts a wallet
change, purges protected browser storage, and replaces the document through the
management component to discard React/query/module caches. No local state alone
claims reassignment. Cancellation also waits for a confirmed server state.

Navigation/auth changes abort requests and discard intent state; delayed wallet
prompts cannot submit after unmount. Focus refreshes authoritative state unless a
mutation is pending. Pending guards prevent double sends. Status/alert roles,
explicit wallet/network/expiry text, disabled expired controls and a final
confirmation warning make state transitions accessible.

Validation: focused Jest/RTL suites, `npm run lint`, `npm test -- --runInBand`,
`npm run build`, `npm run test:contracts`; synthetic fixtures only.
