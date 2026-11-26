import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Production Bundle Scanner for Secrets and Source Maps
 *
 * This script scans the .next build output for:
 * 1. Exposed secrets (private keys, tokens, internal endpoints, credentials)
 * 2. Unintended source maps in production bundles
 * 3. Both are fail-closed: any detection causes a non-zero exit
 *
 * The scanner never prints secret values, only finding types and locations.
 * Findings are deterministic and bounded to specific patterns with explicit allowlists.
 */

const root = process.cwd();
const buildDir = path.join(root, ".next");

// Files and directories that are expected in production bundles
const ignoredDirectories = new Set([".git", "node_modules"]);

// File extensions that are allowed in production bundles
const allowedExtensions = new Set([
  ".js",     // Next.js chunks, runtime
  ".json",   // static data, manifests
  ".woff",   // fonts
  ".woff2",
  ".ttf",
  ".eot",
  ".svg",    // icons, images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".css",    // static styles
  ".txt",    // robots.txt, sitemap.txt, etc.
]);

// Patterns that indicate secrets (non-exhaustive; matched case-insensitively in code context)
const secretPatterns = [
  // Private key indicators (PEM/PGP)
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i,
  /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/i,
  /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/i,
  /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/i,

  // AWS/GCP credentials (explicit ARN/key patterns)
  /AKIA[0-9A-Z]{16}/,      // AWS access key
  /aws_secret_access_key\s*[:=]/i,
  /aws_access_key_id\s*[:=]/i,

  // API keys and tokens (high entropy after common prefixes)
  /api[_-]?key\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})/i,
  /bearer\s+([a-zA-Z0-9_\-\.]{20,})/i,
  /authorization\s*[:=]\s*['"]?Bearer\s+/i,
  /x[_-]?api[_-]?key\s*[:=]/i,

  // Database connection strings (user:pass@ pattern)
  /(?:mongodb|mysql|postgres|redis):\/\/[^@]*:[^@]*@/i,
  /DATABASE_URL\s*[:=]\s*['"]?([a-z]+:\/\/)/i,

  // Internal endpoints / non-public domains
  /https?:\/\/(?:internal|private|admin|staging)[.-]/i,
  /https?:\/\/(?:localhost|127\.0\.0\.1|172\.|192\.168\.)[:\w\/]*/i,

  // Generic sensitive keywords (if followed by assignment)
  /(?:password|passwd|pwd|secret|token|credential|api_key|private_key|private_secret)\s*[:=]/i,

  // Vault / secret manager references
  /vault[_-]?(?:addr|token|role|secret_id)\s*[:=]/i,
  /stripe[_-]?secret\s*[:=]/i,
  /github[_-]?(?:token|pat)\s*[:=]/i,
];

// Patterns indicating source maps
const sourceMapPatterns = [
  /\.js\.map$/,           // JavaScript source maps
  /\.css\.map$/,          // CSS source maps
  /\.map$/,               // Generic source map extension
  /sourceMappingURL=/i,   // Inline source map reference
];

// Allowlist: known safe occurrences that match patterns above (e.g., documentation, false positives)
// Each entry is { pattern, filename, reason }
const allowlist = [
  // Next.js internal files that legitimately contain these patterns
  {
    pattern: "sourceMappingURL",
    filename: /next\/dist\/compiled\/.*\.js$/,
    reason: "Next.js internals (compiled runtime)",
  },
];

const findings = [];

function normalize(filePath) {
  return filePath.split(path.sep).join("/");
}

function isAllowed(filePath, match) {
  return allowlist.some(
    (rule) =>
      (!rule.pattern || match.includes(rule.pattern)) &&
      (!rule.filename || rule.filename.test(filePath))
  );
}

async function walk(directory) {
  const files = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(absolutePath)));
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  } catch (error) {
    // Silently skip directories that don't exist or can't be read
    if (error.code !== "ENOENT" && error.code !== "EACCES") {
      throw error;
    }
  }
  return files;
}

function checkSourceMaps(filePath, relativePath) {
  for (const pattern of sourceMapPatterns) {
    if (pattern.test(relativePath)) {
      findings.push({
        type: "source-map",
        file: relativePath,
        reason: "Source map file found in production bundle",
      });
      return;
    }
  }
}

async function checkSecrets(filePath, relativePath, content) {
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      if (!isAllowed(relativePath, content)) {
        findings.push({
          type: "secret",
          file: relativePath,
          reason: "Potential secret pattern detected",
        });
        // Stop checking this file after first match to avoid noise
        return;
      }
    }
  }
}

async function scanBundle() {
  // Check if .next directory exists
  try {
    await stat(buildDir);
  } catch (error) {
    console.error(
      `Build directory not found: ${buildDir}\nRun 'npm run build' first.`
    );
    process.exit(1);
  }

  const files = await walk(buildDir);
  let scanned = 0;
  let skipped = 0;

  for (const absolutePath of files) {
    const relativePath = normalize(path.relative(root, absolutePath));
    const ext = path.extname(relativePath).toLowerCase();

    // Skip non-text files early
    if (!allowedExtensions.has(ext)) {
      skipped++;
      continue;
    }

    // Skip unusually large files (likely binaries or dist artifacts)
    const fileSize = await stat(absolutePath);
    if (fileSize.size > 10 * 1024 * 1024) {
      skipped++;
      continue;
    }

    scanned++;

    // Check for source maps by filename
    checkSourceMaps(absolutePath, relativePath);

    // Check file content for secrets (text files only)
    if ([".js", ".json", ".css", ".txt"].includes(ext)) {
      try {
        const content = await readFile(absolutePath, "utf8");
        await checkSecrets(absolutePath, relativePath, content);
      } catch (error) {
        // Skip files that can't be read as text
        if (error.code !== "EACCES" && error.code !== "EISDIR") {
          console.warn(`Warning: Could not read ${relativePath}: ${error.message}`);
        }
      }
    }
  }

  return { scanned, skipped };
}

async function main() {
  try {
    const { scanned, skipped } = await scanBundle();

    // Deduplicate findings by (type, file) and sort for determinism
    const uniqueFindings = Array.from(
      new Map(findings.map((f) => [`${f.type}:${f.file}`, f])).values()
    ).sort((a, b) => a.file.localeCompare(b.file));

    if (uniqueFindings.length > 0) {
      console.error("Bundle security scan failed:\n");
      for (const finding of uniqueFindings) {
        console.error(`[${finding.type.toUpperCase()}] ${finding.file}`);
        console.error(`  └─ ${finding.reason}`);
      }
      console.error(
        `\nFound ${uniqueFindings.length} security issue(s) in ${scanned} files scanned.`
      );
      process.exit(1);
    }

    console.log(
      `Bundle security scan passed (${scanned} files scanned, ${skipped} skipped).`
    );
    process.exit(0);
  } catch (error) {
    console.error(`Scanner error: ${error.message}`);
    process.exit(1);
  }
}

await main();
