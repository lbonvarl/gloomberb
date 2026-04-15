import type { BrokerConfigField } from "../../types/broker";

export interface FinaryConfig {
  fintermPath?: string;
  email: string;
  password: string;
  totpSecret?: string;
}

export const FINARY_CONFIG_FIELDS: BrokerConfigField[] = [
  {
    key: "fintermPath",
    label: "Finterm Path",
    type: "text",
    required: false,
    placeholder: "/Users/loic.bonvarlet/Dev/finterm",
  },
  {
    key: "email",
    label: "Email",
    type: "text",
    required: true,
    placeholder: "your@email.com",
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    required: true,
    placeholder: "Your Finary password",
  },
  {
    key: "totpSecret",
    label: "TOTP Secret",
    type: "text",
    required: false,
    placeholder: "Optional base32 MFA secret",
  },
];

function coerceString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeFinaryConfig(raw?: Record<string, unknown>): FinaryConfig {
  return {
    fintermPath: coerceString(raw?.fintermPath) || undefined,
    email: coerceString(raw?.email),
    password: coerceString(raw?.password),
    totpSecret: coerceString(raw?.totpSecret) || undefined,
  };
}

export function isFinaryConfigured(raw?: Record<string, unknown>): boolean {
  const config = normalizeFinaryConfig(raw);
  return !!config.email && !!config.password;
}
