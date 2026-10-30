# Cash Planning central storage

Cash Planning uses a dedicated `pfig_cash` schema in PFIG PostgreSQL. The runtime
role `pfig_cash_app` has no rights to HR, MEMO or employee tables. User login and
per-user permissions are intentionally deferred; the web API retains the existing
application access model. Do not treat the backend service key as user authentication.

## Layout and consistency

- `workspaces` is the authoritative, versioned application state, retaining the
  existing JSON formats and all imported sources and user edits.
- `companies`, `customers`, `sales_lines`, `receivable_bills`, `receipt_lines` and
  `cash_entries` are SQL read models updated in the same transaction as the state.
  Source sales, AR balances and settlements retain their imported snapshot meaning;
  they are not a new ledger or a second deduction of confirmed cash receipts.
  The existing application rules still derive live report balances from those sources
  and confirmed cash records.
- `assets` holds the original cash base and debtor classification seed.
- `workspace_events` is append-only for the runtime and records changed values,
  revision, tab/client ID and idempotency request ID. Client IDs are not user identities.
- Existing localStorage is preserved. Legacy code accesses a per-tab memory cache;
  IndexedDB retains pending changes. Failed writes remain visibly unsaved.
- The serialized workspace and each request are limited to 4,000,000 bytes. Large
  imports fail explicitly; they are not silently truncated or partially committed.
- Concurrent saves use a revision check. A conflict freezes editing and offers
  an export before reloading; no automatic last-writer overwrite is performed.
- New data in another tab is announced rather than silently replacing an open form.

The browser checks can be repeated with Playwright CLI:
`playwright-cli -s=cash-db open http://localhost:3000` followed by
`playwright-cli -s=cash-db run-code --filename tests/central-browser.check.js`.
The check reads the local API once, then uses an isolated browser context and mocked
writes for offline, lost-response and conflict scenarios. It does not insert test
transactions into the real workspace.

`npm test` runs the regression and service tests. To also run the disposable
PostgreSQL test, set `CASH_CENTRAL_RUNTIME_FILE` to the operator-only central runtime
file. No test connection credentials belong in the repository.

## Operator setup

1. Verify the central database identity and make an encrypted, restore-tested backup.
2. Run the PostgreSQL integration tests against a disposable database.
3. Run `node scripts/provision-central.mjs CENTRAL_RUNTIME PRIVATE_DIRECTORY --apply`.
   It refuses an existing Cash schema/role and creates no tables in other schemas.
4. Restrict the private directory's Windows ACL to the operator. It contains
   `cash-runtime.secret.json` and a separate encrypted-backup key. Keep both out of Git.
5. Run `node server/start-central.mjs PRIVATE_DIRECTORY/cash-runtime.secret.json`.
   The listener is restricted to `127.0.0.1:8792`.
6. Put `CASH_BACKEND_URL` and `CASH_BACKEND_KEY` in the Next.js server environment.
   Only an HTTPS endpoint is accepted remotely; loopback port 8792 is allowed locally.
   HTTPS tunnel publication, recovery supervision and Production variables must be
   configured before deploying the website. Never publish port 55445.

Production may instead set `CASH_BACKEND_DISCOVERY_URL` to a read-only Vercel
configuration item URL. The proxy accepts only the trusted configuration host and
validated HTTPS Cloudflare tunnel targets, and caches discovery for 15 seconds.
The private Windows supervisor starts only its own immutable backend/tunnel release
and updates this configuration item when its tunnel address changes. It does not
push source, create deployments, or touch HR/MEMO services. This keeps future tunnel
recovery independent of Git upload approval. The private read token and backend key
must be stored as Sensitive Vercel variables, never in the browser or Git.

Frontend and API-proxy Git pushes deploy through Vercel. A change to the standalone
`server/` backend additionally requires publishing a reviewed local backend release;
it is not installed on the database machine by a Git push alone.

The backend exposes only workspace read/write and health routes, never arbitrary SQL.
Writes require a same-origin JSON request and custom header. The service key is kept
between Next.js and the local backend and is never sent to the browser.

## Data migration

The first import is from the checked-out Git snapshot, not a live browser. Before
switching an existing browser, export its data if it contains newer local work.
The page also offers an export of the untouched pre-database localStorage.
Do not automatically merge a browser snapshot over the central dataset.

Snapshots and report backups retain their original provenance and company identifiers.
Money remains signed; receipt source records are not fabricated from AR differences.
PostgreSQL read-model amounts use `numeric(20,4)`. Original source fields remain in JSONB.

## Backup and recovery

The existing HR/MEMO backup inventory and grant verification are scoped to those
modules. Cash requires its own schema backup and restore verification in addition
to the central pre-migration backup. Save the new role credentials and encryption
key in the operator recovery store. Do not restore over a running production schema.

`node scripts/backup-cash.mjs CENTRAL_RUNTIME CASH_PRIVATE_DIRECTORY --verify`
creates an AES-256-GCM encrypted schema dump, reads/decrypts it back, restores it
into a disposable database, compares every table fingerprint and verifies runtime
read/write and append-only audit permissions. It never restores into Production.
Backups are currently operator-run; configure unattended scheduling and an off-machine
recovery copy before treating this application as an unattended production service.

## Git and rollout

After validation, obtain the fresh upload approval required by `AGENTS.md` before
pushing or deploying this change set. Use the selected GitHub account there.
