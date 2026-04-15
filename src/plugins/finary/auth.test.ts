import { describe, expect, test } from "bun:test";
import { buildFintermFailureMessage } from "./auth";

describe("buildFintermFailureMessage", () => {
  test("prefers labeled stderr and stdout details", () => {
    const message = buildFintermFailureMessage(1, "json parse failed", "authentication failed");

    expect(message).toContain("stderr: authentication failed");
    expect(message).toContain("stdout: json parse failed");
  });

  test("falls back to exit code when no process output is available", () => {
    expect(buildFintermFailureMessage(42, "", "")).toBe("finterm export failed with exit code 42");
  });
});
