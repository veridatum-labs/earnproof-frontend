const {
  verifyLockfileIntegrity,
  isValidIntegrity,
  isAllowedRegistry,
} = require("./verify-lockfile-integrity");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("verify-lockfile-integrity (#376)", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lockfile-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("isValidIntegrity", () => {
    it("validates sha512 and sha1 hashes correctly", () => {
      expect(isValidIntegrity("sha512-abc123DEF456==")).toBe(true);
      expect(isValidIntegrity("sha1-0123456789abcdef==")).toBe(true);
      expect(isValidIntegrity("invalid-hash")).toBe(false);
      expect(isValidIntegrity(null)).toBe(false);
    });
  });

  describe("isAllowedRegistry", () => {
    it("accepts registry.npmjs.org and rejects unauthorized registries", () => {
      expect(isAllowedRegistry("https://registry.npmjs.org/react/-/react-19.2.4.tgz")).toBe(true);
      expect(isAllowedRegistry("https://registry.yarnpkg.com/react/-/react-19.2.4.tgz")).toBe(true);
      expect(isAllowedRegistry("http://malicious-registry.evil.com/react.tgz")).toBe(false);
      expect(isAllowedRegistry("https://untrusted.internal.net/pkg.tgz")).toBe(false);
    });
  });

  describe("verifyLockfileIntegrity - Positive case", () => {
    it("passes for valid package.json and consistent lockfile", () => {
      const pkg = {
        name: "test-app",
        dependencies: {
          react: "^19.0.0",
        },
      };

      const lock = {
        name: "test-app",
        lockfileVersion: 3,
        packages: {
          "": {
            dependencies: {
              react: "^19.0.0",
            },
          },
          "node_modules/react": {
            version: "19.2.4",
            resolved: "https://registry.npmjs.org/react/-/react-19.2.4.tgz",
            integrity: "sha512-validHash123==",
          },
        },
      };

      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkg));
      fs.writeFileSync(path.join(tempDir, "package-lock.json"), JSON.stringify(lock));

      const result = verifyLockfileIntegrity({ rootDir: tempDir });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.verifiedPackages).toBe(1);
    });
  });

  describe("verifyLockfileIntegrity - Negative & Boundary cases", () => {
    it("fails when package.json dependency is missing from package-lock.json (manifest drift)", () => {
      const pkg = {
        dependencies: {
          "new-unlocked-dep": "^1.0.0",
        },
      };
      const lock = {
        lockfileVersion: 3,
        packages: { "": { dependencies: {} } },
      };

      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkg));
      fs.writeFileSync(path.join(tempDir, "package-lock.json"), JSON.stringify(lock));

      const result = verifyLockfileIntegrity({ rootDir: tempDir });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Manifest drift: dependency "new-unlocked-dep@^1.0.0"');
    });

    it("fails when package comes from an untrusted registry", () => {
      const pkg = { dependencies: {} };
      const lock = {
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/compromised-pkg": {
            version: "1.0.0",
            resolved: "http://attacker.example.com/compromised.tgz",
            integrity: "sha512-someHash==",
          },
        },
      };

      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkg));
      fs.writeFileSync(path.join(tempDir, "package-lock.json"), JSON.stringify(lock));

      const result = verifyLockfileIntegrity({ rootDir: tempDir });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Unexpected registry for \"node_modules/compromised-pkg\"");
    });

    it("fails when package is missing integrity metadata", () => {
      const pkg = { dependencies: {} };
      const lock = {
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/unverified-pkg": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/unverified/-/unverified-1.0.0.tgz",
          },
        },
      };

      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(pkg));
      fs.writeFileSync(path.join(tempDir, "package-lock.json"), JSON.stringify(lock));

      const result = verifyLockfileIntegrity({ rootDir: tempDir });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Missing \"integrity\" hash");
    });

    it("handles missing files gracefully", () => {
      const result = verifyLockfileIntegrity({ rootDir: path.join(tempDir, "empty") });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Missing package.json");
    });
  });
});
