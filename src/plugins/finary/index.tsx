import type { GloomPlugin } from "../../types/plugin";
import { finaryBroker } from "./broker-adapter";

export const finaryPlugin: GloomPlugin = {
  id: "finary",
  name: "Finary",
  version: "1.0.0",
  description: "Import Finary accounts as broker portfolios with ownership-aware views.",
  broker: finaryBroker,
};
