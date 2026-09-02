/**
 * Core, pure logic for the route performance budget gate.
 *
 * Deliberately framework/runtime free (plain CommonJS, no Next.js or DOM
 * APIs) so it can be:
 *   - required directly from the CLI (`check-budgets.js`) against a real
 *     `next build` output, and
 *   - unit tested with synthetic fixtures (`budget-check.test.js`) without
 *     needing a build at all.
 */

const fs = require("fs");
const path = require("path");

/**
 * Map a route's public path to the static HTML file Next.js emits for it
 * under `.next/server/app`.
 */
function routeToHtmlFile(route) {
  if (route === "/") {
    return "index.html";
  }
  return `${route.replace(/^\//, "")}.html`;
}

function routeToHtmlPath(buildDir, route) {
  return path.join(buildDir, "server", "app", routeToHtmlFile(route));
}

/**
 * Pull every `/_next/static/...` script and stylesheet URL referenced by a
 * rendered route's HTML. This mirrors exactly what a browser loads on
 * first visit, which is more reliable than re-deriving it from Next's
 * internal manifests (which vary by bundler/version).
 */
function extractStaticAssetPaths(html) {
  const found = new Set();
  const scriptRe = /<script[^>]*\ssrc="([^"]+)"/g;
  const linkRe = /<link[^>]*\shref="([^"]+)"[^>]*>/g;

  let match;
  while ((match = scriptRe.exec(html))) {
    found.add(match[1]);
  }
  while ((match = linkRe.exec(html))) {
    found.add(match[1]);
  }

  return [...found].filter((assetPath) => assetPath.startsWith("/_next/static/"));
}

/**
 * List every prerendered app route to check, derived from Next's own
 * route manifest. Route handlers (e.g. `/favicon.ico`) and internal
 * routes (`/_not-found`, `/_global-error`) are excluded — they are not
 * navigable pages with a "first load JS" budget.
 */
function listBuildRoutes(buildDir) {
  const manifestPath = path.join(buildDir, "app-path-routes-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const routes = new Set();
  for (const [entryKey, route] of Object.entries(manifest)) {
    if (entryKey.endsWith("/route")) continue; // API/route handlers
    if (route.startsWith("/_")) continue; // Next-internal routes
    routes.add(route);
  }
  return [...routes].sort();
}

function listMeasurableBuildRoutes(buildDir) {
  return listBuildRoutes(buildDir).filter((route) => fs.existsSync(routeToHtmlPath(buildDir, route)));
}

function listSkippedBuildRoutes(buildDir) {
  const measurable = new Set(listMeasurableBuildRoutes(buildDir));
  return listBuildRoutes(buildDir).filter((route) => !measurable.has(route));
}

/**
 * Measure one route's real First Load JS (sum of unique JS asset bytes
 * referenced by its rendered HTML) and its largest single static asset
 * (JS or CSS) — the two figures the budgets in `budgets.json` are defined
 * against.
 */
function measureRoute(buildDir, route) {
  const htmlFile = routeToHtmlPath(buildDir, route);
  const html = fs.readFileSync(htmlFile, "utf8");
  const assetPaths = extractStaticAssetPaths(html);

  const assets = assetPaths.map((assetPath) => {
    const relative = assetPath.replace(/^\/_next\//, "");
    const filePath = path.join(buildDir, relative);
    const bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    return {
      chunk: path.basename(assetPath.split("?")[0]),
      assetPath,
      bytes,
      isJs: assetPath.split("?")[0].endsWith(".js"),
    };
  });

  const firstLoadJsBytes = assets
    .filter((asset) => asset.isJs)
    .reduce((sum, asset) => sum + asset.bytes, 0);

  const largestAsset = assets.reduce(
    (max, asset) => (asset.bytes > max.bytes ? asset : max),
    { chunk: "(none)", assetPath: "", bytes: 0, isJs: false },
  );

  const largestJsChunk = assets
    .filter((asset) => asset.isJs)
    .reduce((max, asset) => (asset.bytes > max.bytes ? asset : max), {
      chunk: "(none)",
      assetPath: "",
      bytes: 0,
      isJs: true,
    });

  return { route, assets, firstLoadJsBytes, largestAsset, largestJsChunk };
}

function measureAllRoutes(buildDir) {
  return listMeasurableBuildRoutes(buildDir).map((route) => measureRoute(buildDir, route));
}

/**
 * Resolve the budget that applies to a given route: an explicit
 * `routes[route]` override falls back to `defaults`, and either may omit
 * individual fields (in which case the sibling default field is used).
 */
function resolveBudget(budgets, route) {
  const override = budgets.routes && budgets.routes[route];
  return { ...budgets.defaults, ...override };
}

/**
 * Pure comparison of measurements against budgets. Returns one result per
 * route with `pass` and a list of `failures`, each failure naming the
 * chunk responsible so CI output points straight at the cause.
 *
 * This function takes plain data in and returns plain data out — no file
 * system access — which is what makes it possible to unit test the
 * failure path (including a deliberately-over-budget negative fixture)
 * without running a real `next build`.
 */
function evaluateBudgets(measurements, budgets) {
  return measurements.map((measurement) => {
    const budget = resolveBudget(budgets, measurement.route);
    const failures = [];

    if (
      typeof budget.firstLoadJsBytes === "number" &&
      measurement.firstLoadJsBytes > budget.firstLoadJsBytes
    ) {
      failures.push({
        type: "firstLoadJs",
        budgetBytes: budget.firstLoadJsBytes,
        actualBytes: measurement.firstLoadJsBytes,
        overBy: measurement.firstLoadJsBytes - budget.firstLoadJsBytes,
        chunk: measurement.largestJsChunk.chunk,
        chunkBytes: measurement.largestJsChunk.bytes,
      });
    }

    if (
      typeof budget.largestAssetBytes === "number" &&
      measurement.largestAsset.bytes > budget.largestAssetBytes
    ) {
      failures.push({
        type: "largestAsset",
        budgetBytes: budget.largestAssetBytes,
        actualBytes: measurement.largestAsset.bytes,
        overBy: measurement.largestAsset.bytes - budget.largestAssetBytes,
        chunk: measurement.largestAsset.chunk,
        chunkBytes: measurement.largestAsset.bytes,
      });
    }

    return { route: measurement.route, budget, pass: failures.length === 0, failures };
  });
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Render a human-readable report. Used by the CLI; kept separate from
 * `evaluateBudgets` so the comparison logic itself stays trivially
 * testable.
 */
function formatReport(results) {
  const lines = [];
  for (const result of results) {
    const status = result.pass ? "PASS" : "FAIL";
    lines.push(
      `[${status}] ${result.route}  first-load JS budget ${formatBytes(result.budget.firstLoadJsBytes)}, largest asset budget ${formatBytes(result.budget.largestAssetBytes)}`,
    );
    for (const failure of result.failures) {
      lines.push(
        `        ${failure.type} over budget by ${formatBytes(failure.overBy)} ` +
          `(actual ${formatBytes(failure.actualBytes)} vs budget ${formatBytes(failure.budgetBytes)}) ` +
          `— largest contributing chunk: ${failure.chunk} (${formatBytes(failure.chunkBytes)})`,
      );
    }
  }
  return lines.join("\n");
}

module.exports = {
  routeToHtmlFile,
  extractStaticAssetPaths,
  listBuildRoutes,
  listMeasurableBuildRoutes,
  listSkippedBuildRoutes,
  measureRoute,
  measureAllRoutes,
  resolveBudget,
  evaluateBudgets,
  formatBytes,
  formatReport,
};
