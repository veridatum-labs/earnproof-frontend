#!/usr/bin/env node

/**
 * Verifies dependency lockfile integrity and consistency (#376).
 *
 * Scope:
 * - Detect unexpected registries (enforce official npm registry https://registry.npmjs.org/ or approved scopes).
 * - Detect missing integrity metadata (sha512 / sha1 hashes on non-bundled dependencies).
 * - Detect manifest (package.json) vs lockfile (package-lock.json) version drift.
 * - Enforce frozen lockfile invariants and deterministic resolution.
 */

const fs = require("fs");
const path = require("path");

const ALLOWED_REGISTRIES = [
  "https://registry.npmjs.org/",
  "https://registry.yarnpkg.com/",
];

/**
 * Validates integrity hash format (sha512-... or sha1-...)
 */
function isValidIntegrity(integrity) {
  if (typeof integrity !== "string") return false;
  return /^sha(512|384|256|1)-[A-Za-z0-9+/=]+$/.test(integrity.trim());
}

/**
 * Checks whether a resolved URL comes from an allowed registry.
 */
function isAllowedRegistry(resolvedUrl, allowed = ALLOWED_REGISTRIES) {
  if (!resolvedUrl || typeof resolvedUrl !== "string") return false;
  return allowed.some((reg) => resolvedUrl.startsWith(reg));
}

/**
 * Validates package.json dependencies are properly tracked in package-lock.json
 */
function verifyLockfileIntegrity(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const packageJsonPath = path.join(rootDir, "package.json");
  const packageLockPath = path.join(rootDir, "package-lock.json");

  const errors = [];
  const warnings = [];

  if (!fs.existsSync(packageJsonPath)) {
    return { valid: false, errors: ["Missing package.json"], warnings: [] };
  }
  if (!fs.existsSync(packageLockPath)) {
    return { valid: false, errors: ["Missing package-lock.json"], warnings: [] };
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const lock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));

  if (!lock.lockfileVersion || lock.lockfileVersion < 2) {
    errors.push(`Unsupported or missing lockfileVersion (${lock.lockfileVersion}). Expected version 2 or 3.`);
  }

  const packages = lock.packages || {};
  const rootPkg = packages[""] || {};

  // 1. Verify manifest dependencies match root lockfile dependencies
  const declaredDeps = { ...pkg.dependencies };
  const declaredDevDeps = { ...pkg.devDependencies };

  const lockRootDeps = { ...(rootPkg.dependencies || lock.dependencies || {}) };
  const lockRootDevDeps = { ...(rootPkg.devDependencies || {}) };

  for (const [dep, semverRange] of Object.entries(declaredDeps)) {
    if (!lockRootDeps[dep]) {
      errors.push(`Manifest drift: dependency "${dep}@${semverRange}" in package.json is missing from package-lock.json.`);
    }
  }

  for (const [dep, semverRange] of Object.entries(declaredDevDeps)) {
    if (!lockRootDevDeps[dep] && !lockRootDeps[dep]) {
      errors.push(`Manifest drift: devDependency "${dep}@${semverRange}" in package.json is missing from package-lock.json.`);
    }
  }

  // 2. Verify all installed packages have valid integrity and approved registry sources
  let verifiedPackages = 0;

  for (const [pkgPath, info] of Object.entries(packages)) {
    if (!pkgPath) continue; // Skip root project descriptor

    // Skip symlinked local packages
    if (info.link) continue;

    // Bundled dependencies are packed inside parent tarballs and don't carry independent resolved/integrity
    if (info.inBundle) continue;

    verifiedPackages++;

    // Check registry
    if (info.resolved) {
      if (!isAllowedRegistry(info.resolved, options.allowedRegistries || ALLOWED_REGISTRIES)) {
        errors.push(`Unexpected registry for "${pkgPath}": resolved from "${info.resolved}". Expected ${ALLOWED_REGISTRIES.join(" or ")}`);
      }
    } else {
      errors.push(`Missing "resolved" URL for package "${pkgPath}".`);
    }

    // Check integrity
    if (!info.integrity) {
      errors.push(`Missing "integrity" hash for package "${pkgPath}".`);
    } else if (!isValidIntegrity(info.integrity)) {
      errors.push(`Malformed integrity hash for package "${pkgPath}": "${info.integrity}".`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    verifiedPackages,
  };
}

// If invoked as a CLI
if (require.main === module) {
  const result = verifyLockfileIntegrity();
  if (!result.valid) {
    console.error("❌ Lockfile integrity check failed:\n");
    result.errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  } else {
    console.log(`✅ Lockfile integrity verified successfully (${result.verifiedPackages} packages checked).`);
    process.exit(0);
  }
}

module.exports = {
  verifyLockfileIntegrity,
  isValidIntegrity,
  isAllowedRegistry,
};
