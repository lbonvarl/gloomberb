Stack: Bun + OpenTUI

Use tmux to test your changes (see the `tui-testing` skill). Always kill the tmux session when done.
Add mouse/cursor interactivity for everything interactive.
Never fix chart issues by disabling / turning off the kitty renderer; preserve kitty support and fix the root cause.
When adding new pane/plugin, read PLUGINS.md check how others are made first to keep UI consistent. Always prefer shared UI components and plugin APIs before rolling your own.

Project context from recent Finary work:
- This fork contains a built-in `finary` broker plugin.
- The current Finary implementation uses a Rust bridge to `~/Dev/finterm`, not a direct TypeScript auth flow.
- Gloomberb shells out to `cargo run -q -p finterm -- finary-export-json ...` and maps the returned JSON into broker accounts and positions.
- Ownership metadata is persisted on imported portfolios and used by `portfolio-list` owner filtering and ownership-weighted totals.
- Finary broker accounts with zero imported positions are pruned during sync and should not remain as empty portfolios.
- Import-time quote refresh is skipped for `exchange: "FINARY"` symbols because many are not resolvable by current providers.
- There is a short Finary snapshot cache in Gloomberb to avoid repeated Rust exports during startup and immediate retries.
- The command-bar broker field rendering is now fixed: only the Password field uses the masked overlay; Email, TOTP, and Finterm Path use plain text rendering.
- Known open issues remain around:
  - surfacing full Rust stderr from failed exports
  - unsupported direct quote lookups for some imported Finary symbols
