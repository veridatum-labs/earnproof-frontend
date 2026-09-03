import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "node:util";

// jsdom doesn't implement TextEncoder/TextDecoder; Node's util module does.
// Needed by anything that pulls in lib/validation/qr-payload.ts (byte-length
// checks on proof IDs), directly or transitively.
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;
}

if (typeof globalThis.Response === "undefined") {
  class TestResponse {
    readonly status: number;
    readonly ok: boolean;
    private readonly bodyText: string;

    constructor(body: BodyInit | null = null, init: ResponseInit = {}) {
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.bodyText = typeof body === "string" ? body : "";
    }

    async json(): Promise<unknown> {
      return JSON.parse(this.bodyText);
    }

    async text(): Promise<string> {
      return this.bodyText;
    }
  }

  globalThis.Response = TestResponse as unknown as typeof Response;
}

if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = jest.fn() as unknown as typeof fetch;
}

if (typeof URL.createObjectURL === "undefined") {
  URL.createObjectURL = jest.fn(() => "blob:earnproof-test") as unknown as typeof URL.createObjectURL;
}

if (typeof URL.revokeObjectURL === "undefined") {
  URL.revokeObjectURL = jest.fn() as unknown as typeof URL.revokeObjectURL;
}
