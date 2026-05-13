import { beforeEach } from "vitest";

beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: {
      platform: "linux",
      language: "en-US",
      userAgent: "",
      userAgentData: { platform: "linux" },
    },
    configurable: true,
    writable: true,
  });
});
