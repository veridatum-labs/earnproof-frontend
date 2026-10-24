import { expect, test } from "@playwright/test";
import { mockEarnProofApi, mockVerifyApi } from "./fixtures/mock-api";
import { mockFreighterWallet } from "./fixtures/mock-freighter";
import { runAxeScan } from "./fixtures/axe";

test.describe("Operational metrics charts accessibility", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await mockEarnProofApi(page);
    await mockVerifyApi(page);
    await mockFreighterWallet(page);
  });

  test("line chart has no critical/serious axe violations", async ({
    page,
    testInfo,
  }) => {
    await page.goto("/operational-metrics");
    await page.waitForLoadState("networkidle");
    await runAxeScan(page, testInfo, { routeName: "line-chart" });
  });

  test("bar chart has no critical/serious axe violations", async ({
    page,
    testInfo,
  }) => {
    await page.goto("/operational-metrics");
    await page.waitForLoadState("networkidle");
    await runAxeScan(page, testInfo, { routeName: "bar-chart" });
  });

  test("threshold indicator has no critical/serious axe violations", async ({
    page,
    testInfo,
  }) => {
    await page.goto("/operational-metrics");
    await page.waitForLoadState("networkidle");
    await runAxeScan(page, testInfo, { routeName: "threshold-indicator" });
  });

  test("chart legend has no critical/serious axe violations", async ({
    page,
    testInfo,
  }) => {
    await page.goto("/operational-metrics");
    await page.waitForLoadState("networkidle");
    await runAxeScan(page, testInfo, { routeName: "chart-legend" });
  });

  test("empty state has no critical/serious axe violations", async ({
    page,
    testInfo,
  }) => {
    await page.goto("/operational-metrics");
    await page.waitForLoadState("networkidle");
    await runAxeScan(page, testInfo, { routeName: "empty-state" });
  });

  test("data table fallback has no critical/serious axe violations", async ({
    page,
    testInfo,
  }) => {
    await page.goto("/operational-metrics");
    await page.waitForLoadState("networkidle");
    await runAxeScan(page, testInfo, { routeName: "data-table-fallback" });
  });
});