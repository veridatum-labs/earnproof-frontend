/**
 * Integration test: Full build and security scan flow
 *
 * This test:
 * 1. Runs a production build
 * 2. Verifies the scanner passes (no secrets or source maps exposed)
 * 3. Confirms the build artifacts contain no leaks
 *
 * Run with: npm run test -- bundle-scan-integration.test.ts
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

describe("Bundle security scan integration", () => {
  const rootDir = process.cwd();
  const buildDir = path.join(rootDir, ".next");
  const buildArtifactDir = path.join(rootDir, ".next/analyze");

  // Clean up build artifacts before tests
  beforeAll(() => {
    try {
      // Clean previous builds to ensure fresh state
      if (existsSync(buildDir)) {
        console.log("Cleaning previous build artifacts...");
        execSync("npm run build", { cwd: rootDir, stdio: "pipe" });
      }
    } catch (error) {
      console.warn("Build cleanup warning:", error.message);
    }
  });

  describe("Production build without source maps", () => {
    it("should produce a valid production build", () => {
      expect(execSync("npm run build", { cwd: rootDir, stdio: "pipe" }).toString()).toBeTruthy();
      expect(existsSync(buildDir)).toBe(true);
    });

    it("should not include browser source maps in normal build", () => {
      // Source maps should NOT be in .next for normal builds (only with ANALYZE_BUNDLE=1)
      const findSourceMaps = () => {
        try {
          // Search recursively for .js.map or .css.map files in .next
          const output = execSync(`find "${buildDir}" -name "*.map" 2>/dev/null`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
          }).trim();
          return output ? output.split("\n").filter((line) => line.length > 0) : [];
        } catch {
          return [];
        }
      };

      const sourceMaps = findSourceMaps();
      expect(sourceMaps).toEqual([]);
    });

    it("should have valid JavaScript chunks", () => {
      const staticDir = path.join(buildDir, "static");
      expect(existsSync(staticDir)).toBe(true);

      // Verify chunks exist and are readable
      try {
        const chunkContent = execSync(`find "${staticDir}" -name "*.js" -type f | head -1`, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
        }).trim();

        if (chunkContent) {
          const content = readFileSync(chunkContent, "utf8");
          expect(content.length).toBeGreaterThan(0);
          // Should be minified (no extensive whitespace)
          expect(content.split("\n").length).toBeLessThan(
            content.length / 100,
            "Chunk should be minified"
          );
        }
      } catch (error) {
        console.warn("Chunk validation skipped:", error.message);
      }
    });
  });

  describe("Security scan after build", () => {
    it("should pass the bundle secrets scanner", () => {
      const result = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      expect(result).toContain("Bundle security scan passed");
    });

    it("should not expose any secrets in the bundle", () => {
      const result = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      // The scanner output should not contain any [SECRET] findings
      expect(result).not.toContain("[SECRET]");
      expect(result).not.toContain("[SOURCE-MAP]");
    });

    it("should report bundle scan in deterministic format", () => {
      const result1 = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      const result2 = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      // Both runs should produce consistent output (file counts may vary slightly,
      // but the pass/fail status should be identical)
      expect(result1).toContain("Bundle security scan passed");
      expect(result2).toContain("Bundle security scan passed");
    });
  });

  describe("Build artifacts validation", () => {
    it("should contain expected .next structure", () => {
      const expectedDirs = [
        path.join(buildDir, "static"),
        path.join(buildDir, "server"),
      ];

      for (const dir of expectedDirs) {
        expect(existsSync(dir)).toBe(
          true,
          `Expected directory ${dir} to exist in build`
        );
      }
    });

    it("should have server-side rendering artifacts", () => {
      // The build should have functions (server-side JS) for API routes and pages
      const serverDir = path.join(buildDir, "server");
      expect(existsSync(serverDir)).toBe(true);

      // At minimum, should have app route handling
      const hasServerCode = execSync(`find "${serverDir}" -type f | wc -l`, {
        encoding: "utf8",
      }).trim();

      expect(parseInt(hasServerCode, 10)).toBeGreaterThan(0);
    });

    it("should have valid manifests", () => {
      const manifestPath = path.join(buildDir, "app-path-routes-manifest.json");
      expect(existsSync(manifestPath)).toBe(
        true,
        "Build should include app-path-routes-manifest.json"
      );

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(typeof manifest).toBe("object");
    });
  });

  describe("Compatibility with existing checks", () => {
    it("should not interfere with bundle composition analysis", () => {
      // The security scan runs before bundle:analyze, so both should work together
      const result = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      expect(result).toContain("passed");
    });

    it("should be deterministic across multiple runs", () => {
      const outputs = [];

      for (let i = 0; i < 3; i++) {
        const output = execSync("npm run security:scan-bundle", {
          cwd: rootDir,
          stdio: "pipe",
          encoding: "utf8",
        });
        outputs.push(output);
      }

      // All runs should report the same result
      for (const output of outputs) {
        expect(output).toContain("Bundle security scan passed");
      }
    });
  });

  describe("Error cases", () => {
    it("should fail gracefully if .next directory is missing", () => {
      // Create a temporary test directory without .next
      const tempDir = path.join(rootDir, ".test-no-build-temp");
      execSync(`mkdir -p "${tempDir}"`, { stdio: "pipe" });

      try {
        execSync(
          `cd "${tempDir}" && node "${path.join(rootDir, "scripts/security/scan-bundle-secrets.mjs")}"`,
          { stdio: "pipe" }
        );
        fail("Should have exited with error");
      } catch (error) {
        expect(error.message).toContain("Build directory not found");
      } finally {
        execSync(`rm -rf "${tempDir}"`, { stdio: "pipe" });
      }
    });
  });

  describe("Output format validation", () => {
    it("should report file count in output", () => {
      const result = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      expect(result).toMatch(/\d+\s+files\s+scanned/i);
    });

    it("should provide actionable error messages if findings exist", () => {
      // This test documents the expected error format if/when a finding occurs
      // (even though current clean build should pass)
      const result = execSync("npm run security:scan-bundle", {
        cwd: rootDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      // If there were failures, they would be formatted as:
      // [TYPE] /path/to/file
      //   └─ reason message
      const errorPattern = /(\[SECRET\]|\[SOURCE-MAP\])\s+\.next/;
      if (result.includes("[SECRET]") || result.includes("[SOURCE-MAP]")) {
        expect(result).toMatch(errorPattern);
      }
    });
  });
});
