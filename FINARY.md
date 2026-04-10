# Finary Plugin

## Current architecture

The built-in `finary` broker plugin in this fork does not authenticate directly from Gloomberb.

Instead, it shells out to the local Rust project at `~/Dev/finterm` and runs:

```bash
cargo run -q -p finterm -- finary-export-json --email ... --password ... [--totp ...]
```

This reuses the Rust Finary client and Clerk authentication flow that already works in `finterm`.

## Data flow

1. Gloomberb validates that the Finary broker instance has credentials.
2. Gloomberb runs the Rust export command in the configured `Finterm Path`.
3. `finterm` logs in to Finary and exports one JSON portfolio snapshot.
4. Gloomberb maps the JSON into:
   - `BrokerAccount[]`
   - `BrokerPosition[]`
5. Sync creates one Gloomberb portfolio per Finary account that has imported positions.
6. Ownership metadata is persisted on portfolios and used by `portfolio-list` owner filtering and weighting.

## Broker fields

- `Finterm Path`: path to the local `finterm` checkout. Default: `~/Dev/finterm`
- `Email`: Finary login email
- `Password`: Finary login password
- `TOTP Secret`: either:
  - a TOTP secret, or
  - a 6-digit current TOTP code

The Rust bridge now accepts either form for MFA.

## Ownership behavior

- each imported Finary account can carry ownership shares
- `portfolio-list` has an `Owner View` filter
- when an owner is selected:
  - only owned accounts remain visible
  - totals are weighted by ownership share

## Current optimizations

- Finary quote refreshes are skipped for `exchange: "FINARY"` imported symbols, because many are not resolvable by current quote providers
- empty Finary accounts are pruned during sync, so portfolios with zero imported positions are not kept
- a short cached Finary snapshot is reused to reduce repeated Rust exports during startup and immediate retries

## Current issues

- broker setup/edit UX has been fragile in the command bar; text/password rendering has been adjusted multiple times and should be treated as an active area
- manual sync failures still need better stderr surfacing from the Rust bridge into Gloomberb's debug log
- some Finary symbols still produce `No provider available` if the user later focuses them directly in ticker panes; skipping import-time refresh reduced the main churn but did not solve unsupported symbol lookup globally
- onboarding / reconnect flows with multiple old Finary broker instances may still create confusing retry patterns

## Rejected approach

We attempted a TypeScript-only browser automation path with Playwright and browser workers.

That approach was dropped because:

- Clerk bot protection blocked direct TS auth flows
- browser state validation was brittle
- it added significant complexity and degraded startup / broker UX

The repo currently uses the Rust bridge instead.

## Next likely improvements

1. surface full `finterm` stderr to a dedicated artifact file and log that file path in Gloomberb
2. add a small success/failure status surface for the Finary broker instance in the UI
3. normalize more Finary symbols for resolvable quote providers where possible
4. if more brokers reuse `finterm`, extract a generic Rust-bridge helper for broker plugins
