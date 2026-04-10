import { spawn } from "bun";
import { existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import type { BrokerInstanceConfig } from "../../types/config";
import { debugLog } from "../../utils/debug-log";
import { normalizeFinaryConfig } from "./config";

const finaryRustLog = debugLog.createLogger("finary-rust");
const DEFAULT_FINTERM_DIR = "/Users/loic.bonvarlet/Dev/finterm";
const FAILURE_COOLDOWN_MS = 30_000;
const SNAPSHOT_CACHE_TTL_MS = 5 * 60_000;

interface FailedInvocation {
  failedAt: number;
  message: string;
}

const failedInvocations: Map<string, FailedInvocation> = (globalThis as any).__finaryRustFailures ??= new Map();

export interface FintermFinaryHolding {
  name: string;
  symbol?: string | null;
  isin?: string | null;
  quantity?: number | null;
  buying_price?: number | null;
  current_price?: number | null;
  current_value?: number | null;
  buying_value?: number | null;
  unrealized_pnl?: number | null;
  unrealized_pnl_percent?: number | null;
  asset_type: string;
  currency?: string | null;
}

export interface FintermOwnershipShare {
  name: string;
  share: number;
}

export interface FintermFinaryAccount {
  id: string;
  name: string;
  account_type: string;
  institution?: string | null;
  ownership: FintermOwnershipShare[];
  balance: number;
  currency: string;
  unrealized_pnl?: number | null;
  unrealized_pnl_percent?: number | null;
  evolution?: number | null;
  sync_source: string;
  last_sync_at?: string | null;
  holdings: FintermFinaryHolding[];
}

export interface FintermFinaryPortfolio {
  net_worth_gross: number;
  net_worth_net: number;
  accounts: FintermFinaryAccount[];
  last_sync?: string | null;
}

function resolveFintermDir(instance: BrokerInstanceConfig): string {
  const raw = instance.config?.fintermPath;
  return typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_FINTERM_DIR;
}

function truncate(value: string, length = 500): string {
  const trimmed = value.trim();
  return trimmed.length > length ? `${trimmed.slice(0, length)}...` : trimmed;
}

function getSnapshotCachePath(instance: BrokerInstanceConfig): string {
  const dataDir = instance.config?.dataDir;
  const root = typeof dataDir === "string" && dataDir.trim() ? dataDir.trim() : "/Users/loic.bonvarlet/.gloomberb";
  const dir = join(root, "finary-cache");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${instance.id}.json`);
}

async function loadCachedSnapshot(instance: BrokerInstanceConfig): Promise<FintermFinaryPortfolio | null> {
  const cachePath = getSnapshotCachePath(instance);
  if (!existsSync(cachePath)) return null;
  const stat = statSync(cachePath);
  if (Date.now() - stat.mtimeMs > SNAPSHOT_CACHE_TTL_MS) {
    return null;
  }
  try {
    return await Bun.file(cachePath).json() as FintermFinaryPortfolio;
  } catch {
    return null;
  }
}

async function writeCachedSnapshot(instance: BrokerInstanceConfig, portfolio: FintermFinaryPortfolio): Promise<void> {
  await Bun.write(getSnapshotCachePath(instance), JSON.stringify(portfolio));
}

export async function loadFintermFinaryPortfolio(instance: BrokerInstanceConfig): Promise<FintermFinaryPortfolio> {
  const recentFailure = failedInvocations.get(instance.id);
  if (recentFailure && Date.now() - recentFailure.failedAt < FAILURE_COOLDOWN_MS) {
    const cached = await loadCachedSnapshot(instance);
    if (cached) {
      finaryRustLog.info("Using cached Finterm Finary portfolio after recent failure", {
        accountCount: cached.accounts.length,
      });
      return cached;
    }
    throw new Error(recentFailure.message);
  }

  const cached = await loadCachedSnapshot(instance);
  if (cached) {
    finaryRustLog.info("Using cached Finterm Finary portfolio", {
      accountCount: cached.accounts.length,
    });
    return cached;
  }

  const config = normalizeFinaryConfig(instance.config);
  const fintermDir = resolveFintermDir(instance);
  const command = [
    "cargo",
    "run",
    "-q",
    "-p",
    "finterm",
    "--",
    "finary-export-json",
    "--email",
    config.email,
    "--password",
    config.password,
  ];
  if (config.totpSecret) {
    command.push("--totp", config.totpSecret);
  }

  finaryRustLog.info("Running finterm Finary export", {
    fintermDir,
    hasTotpSecret: !!config.totpSecret,
  });
  const proc = spawn(command, {
    cwd: fintermDir,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const summary = truncate(stderr || stdout || `finterm export failed with exit code ${exitCode}`);
    finaryRustLog.error("finterm export failed", {
      exitCode,
      stderr: summary || undefined,
    });
    const message = summary || `finterm export failed with exit code ${exitCode}`;
    failedInvocations.set(instance.id, { failedAt: Date.now(), message });
    throw new Error(message);
  }

  try {
    const portfolio = JSON.parse(stdout) as FintermFinaryPortfolio;
    failedInvocations.delete(instance.id);
    await writeCachedSnapshot(instance, portfolio);
    finaryRustLog.info("Loaded Finterm Finary portfolio", {
      accountCount: portfolio.accounts.length,
    });
    return portfolio;
  } catch (error) {
    throw new Error(`Failed to parse finterm Finary JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
