/**
 * Unit tests for scan-bundle-secrets.mjs
 *
 * Tests cover:
 * - Positive cases: Detects various secret patterns correctly
 * - Negative cases: Passes clean bundles without false positives
 * - Boundary cases: Handles edge cases (empty files, large files, missing dirs)
 * - Authorization: Respects allowlist and skips whitelisted matches
 * - Regression: Ensures deterministic output and proper deduplication
 */

import { test } from "node:test";
import assert from "node:assert";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "../..");
const testFixturesDir = path.join(__dirname, "fixtures/bundle-scanner");

// Helper to run the scanner with a test build directory
async function runScanner(testBuildDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [
      path.join(rootDir, "scripts/security/scan-bundle-secrets.mjs"),
    ], {
      cwd: testBuildDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// Helper to create a temporary test directory with .next folder
async function createTestBuild(files) {
  const tempDir = path.join(testFixturesDir, `build-${Date.now()}`);
  const buildDir = path.join(tempDir, ".next");
  await fs.mkdir(buildDir, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(buildDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  return tempDir;
}

// Helper to clean up test builds
async function cleanupTestBuild(tempDir) {
  await fs.rm(tempDir, { recursive: true, force: true });
}

await test("Positive cases: Secret detection", async (t) => {
  await t.test("detects AWS access key", async () => {
    const tempDir = await createTestBuild({
      "chunk.js": 'const key = "AKIAIOSFODNN7EXAMPLE";',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1, "Scanner should fail");
      assert.match(stderr, /\[SECRET\]/, "Should report secret finding");
      assert.match(stderr, /chunk\.js/, "Should reference the file");
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("detects private key PEM header", async () => {
    const tempDir = await createTestBuild({
      "app.js": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE\n-----END PRIVATE KEY-----",
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SECRET\]/, "Should detect PEM private key");
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("detects database connection strings with credentials", async () => {
    const tempDir = await createTestBuild({
      "config.js": 'const db = "postgresql://user:password@internal-db:5432/prod";',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SECRET\]/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("detects internal endpoint URLs", async () => {
    const tempDir = await createTestBuild({
      "api.js": 'const endpoint = "https://internal-api.example.com/v1";',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SECRET\]/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("detects source map files", async () => {
    const tempDir = await createTestBuild({
      "chunk.js.map": '{"version":3,"sources":["chunk.ts"]}',
      "styles.css.map": '{"version":3}',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SOURCE-MAP\].*chunk\.js\.map/);
      assert.match(stderr, /\[SOURCE-MAP\].*styles\.css\.map/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("detects API key assignments", async () => {
    const tempDir = await createTestBuild({
      "main.js": 'const apiKey = "sk_live_1234567890abcdefghij";',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SECRET\]/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("detects Bearer token patterns", async () => {
    const tempDir = await createTestBuild({
      "auth.js": 'const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWI";',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SECRET\]/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });
});

await test("Negative cases: Clean bundles pass", async (t) => {
  await t.test("passes bundle with public JavaScript code", async () => {
    const tempDir = await createTestBuild({
      "chunk.js": `
        function handleClick() {
          console.log("Button clicked");
          fetch("/api/v1/public/verify")
            .then(r => r.json())
            .catch(e => console.error(e));
        }
      `,
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0, "Scanner should pass");
      assert.match(stdout, /Bundle security scan passed/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("passes bundle with test data that looks like secrets but isn't", async () => {
    const tempDir = await createTestBuild({
      "widget.js": `
        const mockData = {
          user: "john_doe",
          id: "ABC123XYZ789",
          email: "user@example.com"
        };
      `,
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("passes bundle with public URLs", async () => {
    const tempDir = await createTestBuild({
      "app.js": `
        const publicSites = [
          "https://www.example.com",
          "https://api.example.com",
          "https://cdn.example.com"
        ];
      `,
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("passes bundle with only JSON and CSS files", async () => {
    const tempDir = await createTestBuild({
      "data.json": '{"items": [{"id": 1, "name": "test"}]}',
      "styles.css": "body { color: #000; }",
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });
});

await test("Boundary cases: Edge cases and error handling", async (t) => {
  await t.test("fails gracefully if .next directory doesn't exist", async () => {
    const tempDir = path.join(testFixturesDir, `empty-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1, "Should exit with error");
      assert.match(stderr, /Build directory not found/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("skips non-text file types", async () => {
    const tempDir = await createTestBuild({
      "chunk.js": 'console.log("safe");',
      "image.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG header
      "font.woff2": Buffer.from([0x00, 0x01, 0x00, 0x00]), // WOFF2 header
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
      assert.match(stdout, /files scanned/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("skips very large files (>10MB)", async () => {
    const tempDir = await createTestBuild({
      "huge.js": "x".repeat(11 * 1024 * 1024), // 11MB
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
      assert.match(stdout, /skipped/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("handles empty .next directory", async () => {
    const tempDir = path.join(testFixturesDir, `empty-next-${Date.now()}`);
    await fs.mkdir(path.join(tempDir, ".next"), { recursive: true });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
      assert.match(stdout, /0 files scanned/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("handles nested directory structure", async () => {
    const tempDir = await createTestBuild({
      "server/app.js": 'const x = 1;',
      "server/chunks/chunk-abc123.js": 'export const data = {};',
      "static/index.html": '<html></html>',
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0);
      assert.match(stdout, /files scanned/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });
});

await test("Authorization: Allowlist enforcement", async (t) => {
  await t.test("respects allowlist for known safe patterns", async () => {
    const tempDir = await createTestBuild({
      "next/dist/compiled/runtime.js": 'var code="sourceMappingURL="; // Next.js internals',
    });

    try {
      const { code, stdout } = await runScanner(tempDir);
      assert.strictEqual(code, 0, "Allowlisted pattern should not trigger failure");
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });
});

await test("Regression: Determinism and deduplication", async (t) => {
  await t.test("produces consistent output on multiple runs", async () => {
    const testBuild = {
      "app.js": 'const secret = "AKIAIOSFODNN7EXAMPLE";',
    };

    const tempDir1 = await createTestBuild(testBuild);
    const tempDir2 = await createTestBuild(testBuild);

    try {
      const result1 = await runScanner(tempDir1);
      const result2 = await runScanner(tempDir2);

      assert.strictEqual(result1.code, result2.code);
      // Both should report the same finding (allowing for path differences)
      assert.match(result1.stderr, /\[SECRET\]/);
      assert.match(result2.stderr, /\[SECRET\]/);
    } finally {
      await cleanupTestBuild(tempDir1);
      await cleanupTestBuild(tempDir2);
    }
  });

  await t.test("deduplicates multiple findings in same file", async () => {
    const tempDir = await createTestBuild({
      "config.js": `
        const key1 = "AKIAIOSFODNN7EXAMPLE";
        const key2 = "AKIAIOSFODNN7EXAMPLE";
        const key3 = "AKIAIOSFODNN7EXAMPLE";
      `,
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      // Should only report one finding per file, not three
      const findings = stderr.match(/\[SECRET\]/g);
      assert.ok(findings, "Should have findings");
      assert.strictEqual(
        findings.length,
        1,
        "Should deduplicate findings in same file"
      );
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("sorts findings alphabetically by filename for determinism", async () => {
    const tempDir = await createTestBuild({
      "z-chunk.js": 'const key = "AKIAIOSFODNN7EXAMPLE";',
      "a-chunk.js": 'const secret = "-----BEGIN PRIVATE KEY-----";',
      "m-chunk.js": 'const token = "Bearer xyz123";',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      const lines = stderr.split("\n");
      const fileReferences = lines
        .filter((line) => line.includes(".js"))
        .map((line) => {
          const match = line.match(/\[.+?\]\s+(.next[/\\].+?\.js)/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      // Verify alphabetical order
      for (let i = 1; i < fileReferences.length; i++) {
        assert.ok(
          fileReferences[i - 1] <= fileReferences[i],
          `Files should be sorted: ${fileReferences[i - 1]} > ${fileReferences[i]}`
        );
      }
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("reports both secret and source-map findings", async () => {
    const tempDir = await createTestBuild({
      "app.js": 'const key = "AKIAIOSFODNN7EXAMPLE";',
      "styles.js.map": '{"version":3}',
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.match(stderr, /\[SECRET\]/);
      assert.match(stderr, /\[SOURCE-MAP\]/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });
});

await test("Output format: Never prints secret values", async (t) => {
  await t.test("reports secret location without printing the secret value", async () => {
    const secretValue = "AKIAIOSFODNN7EXAMPLE";
    const tempDir = await createTestBuild({
      "chunk.js": `const key = "${secretValue}";`,
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.doesNotMatch(
        stderr,
        new RegExp(secretValue),
        "Scanner output should never contain the actual secret value"
      );
      assert.match(stderr, /\[SECRET\]/);
      assert.match(stderr, /chunk\.js/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });

  await t.test("never prints private key content", async () => {
    const privateKeyContent =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE\n-----END PRIVATE KEY-----";
    const tempDir = await createTestBuild({
      "key.js": `const key = \`${privateKeyContent}\`;`,
    });

    try {
      const { code, stderr } = await runScanner(tempDir);
      assert.strictEqual(code, 1);
      assert.doesNotMatch(stderr, /MIIEvQIBADANBgkqhkiG9w0BAQE/);
      assert.match(stderr, /\[SECRET\]/);
    } finally {
      await cleanupTestBuild(tempDir);
    }
  });
});
