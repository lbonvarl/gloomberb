import type { BrokerAdapter } from "../../types/broker";
import { FINARY_CONFIG_FIELDS, isFinaryConfigured } from "./config";
import { FinaryClient } from "./client";

export const finaryBroker: BrokerAdapter = {
  id: "finary",
  name: "Finary",
  authStrategy: "hybrid",
  pruneEmptyAccounts: true,
  configSchema: FINARY_CONFIG_FIELDS,

  async validate(instance) {
    return isFinaryConfigured(instance.config);
  },

  async listAccounts(instance) {
    return new FinaryClient(instance).listAccounts();
  },

  async importPositions(instance) {
    return new FinaryClient(instance).importPositions();
  },
};
