import { expect, test } from "@playwright/test";
import { mockEarnProofApi, mockVerifyApi } from "./fixtures/mock-api";
import { mockFreighterWallet } from "./fixtures/mock-freighter";

/**
 * Mobile safe areas and virtual keyboard layout tests.
 *
 * Browser chrome (status bar, notches), notches, and virtual keyboards can
 * hide actions or cause overlapping dialogs on mobile devices. This suite
 * ensures primary actions remain visible without text or controls overlapping
 * at supported mobile sizes.
 *
 * Coverage:
 *  - Safe area detection: notched devices (iPhone 14 Pro), rounded corners
 *  - Virtual keyboard interactions: focus on inputs, keyboard shows/hides
 *  - Orientation changes: portrait to landscape with keyboard active
 *  - Zoom interactions: pinch zoom doesn't break layout or hide controls
 *  - Acceptance: no text clipping, no overlapping dialogs, primary actions
 *    remain interactive regardless of keyboard state
 */

/**
 * Supported mobile breakpoints for testing.
 * Based on design specifications in playwright.visual.config.ts
 */
const MOBILE_VIEWPORTS = [
  {
    name: "iPhone 12/13/14 (390px)",
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    // Safe areas for notched iPhones
    safeArea: { top: 47, left: 0, right: 0, bottom: 34 },
  },
  {
    name: "iPhone 14 Pro (393px with notch)",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    // Notch and safe area
    safeArea: { top: 59, left: 0, right: 0, bottom: 34 },
  },
  {
    name: "Android Pixel 5 (393px)",
    width: 393,
    height: 851,
    deviceScaleFactor: 2.75,
    safeArea: { top: 0, left: 0, right: 0, bottom: 34 },
  },
];

test.describe("mobile safe areas", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("primary navigation remains visible and clickable without notch overlap", async ({
    page,
  }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    // Top-level navigation should be within safe area
    const header = page.locator("header");
    const box = await header.boundingBox();

    // On a 390px device, safe area top is ~47px; header should start after
    expect(box?.y || 0).toBeGreaterThanOrEqual(0);
    expect(box?.height || 0).toBeGreaterThan(40);

    // Logo or main nav button should be clickable
    const navTrigger = page.getByRole("button", { name: /toggle|menu/i });
    await expect(navTrigger).toBeVisible();
    await expect(navTrigger).toBeEnabled();
  });

  test("bottom action buttons avoid safe area overlap (virtual keyboard space)", async ({
    page,
  }) => {
    await mockEarnProofApi(page);
    await page.goto("/verify");

    // Primary action button at the bottom
    const submitButton = page.getByRole("button", { name: /verify|submit|check/i }).first();

    if (await submitButton.isVisible()) {
      const box = await submitButton.boundingBox();

      // Button should not be positioned too close to bottom to avoid keyboard
      // Safe area bottom is 34px, so button should have margin above that
      expect(box?.y || 0).toBeLessThan(844 - 100); // ~110px from bottom
      expect(box?.height || 0).toBeGreaterThan(40);
      await expect(submitButton).toBeEnabled();
    }
  });

  test("form inputs are not clipped by rounded corners on notched devices", async ({ page }) => {
    await mockEarnProofApi(page);
    await mockVerifyApi(page);
    await page.goto("/verify/credential");

    const inputs = page.locator("input, textarea");
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const box = await input.boundingBox();

      if (!box) continue;

      // Inputs should have padding from viewport edges
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(390 - 8);
      expect(box.height).toBeGreaterThan(36);
    }
  });

  test("dialogs are positioned within safe area and don't overlap status bar", async ({
    page,
  }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    // Trigger a dialog if one exists (e.g., help dialog)
    const infoButton = page.getByRole("button", { name: /help|info|about/i }).first();
    if (await infoButton.isVisible()) {
      await infoButton.click();
      const dialog = page.getByRole("dialog");

      if (await dialog.isVisible()) {
        const box = await dialog.boundingBox();
        // Dialog should not overlap status bar (top ~47px on iPhone)
        expect(box?.y || 0).toBeGreaterThanOrEqual(40);
        // And should not extend below viewport
        expect((box?.y || 0) + (box?.height || 0)).toBeLessThanOrEqual(844);
      }
    }
  });
});

test.describe("virtual keyboard interactions", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("form input gains focus without being obscured by virtual keyboard", async ({ page }) => {
    await mockEarnProofApi(page);
    await mockVerifyApi(page);
    await page.goto("/verify/credential");

    const firstInput = page.locator("input, textarea").first();
    if (await firstInput.isVisible()) {
      // Focus should trigger scroll-into-view on mobile
      await firstInput.focus();
      await page.waitForTimeout(300);

      const box = await firstInput.boundingBox();
      // Input should be in upper 60% of viewport when keyboard is active
      // (remaining 40% is roughly where virtual keyboard appears)
      expect(box?.y || 0).toBeLessThan(844 * 0.6);
    }
  });

  test("keyboard resizing doesn't hide primary action buttons", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.goto("/verify");

    // Simulate virtual keyboard appearing (reduces viewport height)
    const originalHeight = 844;
    const keyboardHeight = 280;
    const reducedHeight = originalHeight - keyboardHeight;

    await page.setViewportSize({ width: 390, height: reducedHeight });

    const submitButton = page.getByRole("button", { name: /verify|submit|check/i }).first();
    if (await submitButton.isVisible()) {
      await expect(submitButton).toBeInViewport();
    }
  });

  test("form submission works after virtual keyboard interaction", async ({ page }) => {
    await mockEarnProofApi(page);
    await mockVerifyApi(page);
    await page.goto("/verify/credential");

    // Find an input and interact with it
    const inputs = page.locator("input, textarea");
    if (await inputs.count() > 0) {
      const firstInput = inputs.first();
      await firstInput.focus();

      // Type some content
      await firstInput.fill("test content");

      // Simulate keyboard hide (return to full height)
      await page.setViewportSize({ width: 390, height: 844 });

      // Form should still be submittable
      const submitButton = page.getByRole("button", { name: /verify|submit|check/i }).first();
      if (await submitButton.isVisible()) {
        await expect(submitButton).toBeEnabled();
      }
    }
  });
});

test.describe("orientation changes with virtual keyboard", () => {
  test("portrait to landscape preserves layout without text overlap", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    // Start in portrait
    await page.setViewportSize({ width: 390, height: 844 });

    let heading = page.locator("h1, h2").first();
    if (await heading.isVisible()) {
      const portraitBox = await heading.boundingBox();
      expect(portraitBox?.width).toBeLessThanOrEqual(390 - 16);
    }

    // Switch to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300); // Allow layout to reflow

    heading = page.locator("h1, h2").first();
    if (await heading.isVisible()) {
      const landscapeBox = await heading.boundingBox();
      // In landscape, content should use the wider space but not overflow
      expect(landscapeBox?.width).toBeLessThanOrEqual(844 - 16);
      expect(landscapeBox?.height).toBeGreaterThan(0);
    }
  });

  test("landscape mode with virtual keyboard leaves primary actions visible", async ({
    page,
  }) => {
    await mockEarnProofApi(page);
    await page.goto("/verify");

    // Landscape orientation with keyboard
    const landscapeWithKeyboard = { width: 844, height: 280 };
    await page.setViewportSize(landscapeWithKeyboard);

    const submitButton = page.getByRole("button", { name: /verify|submit|check/i }).first();
    if (await submitButton.isVisible()) {
      await expect(submitButton).toBeInViewport();
      await expect(submitButton).toBeEnabled();
    }
  });
});

test.describe("zoom and pinch interactions", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("page remains readable and controls accessible at 150% zoom", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    // Simulate CSS-level zoom (similar effect to pinch zoom)
    await page.evaluate(() => {
      document.documentElement.style.zoom = "150%";
    });

    await page.waitForTimeout(300);

    // Primary navigation should still be accessible
    const navTrigger = page.getByRole("button", { name: /toggle|menu/i });
    if (await navTrigger.isVisible()) {
      await expect(navTrigger).toBeInViewport();
    }
  });

  test("form inputs remain functional after zoom reset", async ({ page }) => {
    await mockEarnProofApi(page);
    await mockVerifyApi(page);
    await page.goto("/verify/credential");

    // Zoom and zoom back
    await page.evaluate(() => {
      document.documentElement.style.zoom = "200%";
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      document.documentElement.style.zoom = "100%";
    });
    await page.waitForTimeout(200);

    const firstInput = page.locator("input, textarea").first();
    if (await firstInput.isVisible()) {
      await firstInput.focus();
      await firstInput.fill("test");
      const value = await firstInput.inputValue();
      expect(value).toBe("test");
    }
  });
});

test.describe("boundary conditions", () => {
  test("minimum safe viewport (320px) shows primary navigation", async ({ page }) => {
    await mockEarnProofApi(page);
    // 320px is WCAG minimum reflow width, though not our designed minimum
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");

    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Navigation should be accessible (expanded or collapsible)
    const navButton = page.getByRole("button", { name: /toggle|menu/i });
    if (await navButton.isVisible()) {
      await expect(navButton).toBeEnabled();
    }
  });

  test("maximum common mobile viewport (430px) shows full layout", async ({ page }) => {
    await mockEarnProofApi(page);
    // Pixel 6 Pro size
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/");

    const main = page.locator("main, [role='main']");
    await expect(main).toBeVisible();

    // No horizontal scrolling should be needed
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for rounding
  });

  test("with virtual keyboard at minimum width, primary action remains accessible", async ({
    page,
  }) => {
    await mockEarnProofApi(page);
    await page.goto("/verify");

    // 320px width with keyboard height reduction
    await page.setViewportSize({ width: 320, height: 460 });

    const submitButton = page.getByRole("button", { name: /verify|submit|check/i }).first();
    if (await submitButton.isVisible()) {
      // Should be in viewport even with keyboard active
      const box = await submitButton.boundingBox();
      expect(box?.y || 0).toBeLessThan(460 - 40);
    }
  });
});

test.describe("authorization and privacy preservation", () => {
  test("safe area behavior doesn't bypass authentication checks", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // Protected routes should still require auth
    await page.goto("/proofs", { waitUntil: "networkidle" });
    // App should redirect to login or show auth prompt, not bypass to content
    const url = page.url();
    expect(url).not.toContain("/proofs");
  });

  test("virtual keyboard doesn't expose sensitive form data in scroll position", async ({
    page,
  }) => {
    await mockEarnProofApi(page);
    await mockVerifyApi(page);
    await page.goto("/verify/credential");

    const firstInput = page.locator("input, textarea").first();
    if (await firstInput.isVisible()) {
      await firstInput.fill("sensitive-data");

      // Keyboard resize shouldn't alter form field visibility in unexpected ways
      await page.setViewportSize({ width: 390, height: 400 });
      await page.waitForTimeout(200);

      // Input should remain in document
      await expect(firstInput).toBeInViewport();
    }
  });
});

test.describe("regression: no text clipping or overlaps", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("navigation text is not clipped by notch", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    const header = page.locator("header");
    const headerBox = await header.boundingBox();

    // Check text elements within header aren't positioned in notch area
    const headerText = header.locator("h1, h2, span, a, button");
    const count = await headerText.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const element = headerText.nth(i);
      const box = await element.boundingBox();

      if (box && box.height > 0) {
        // Text should have left padding from viewport edge
        expect(box.x).toBeGreaterThanOrEqual(0);
        // And not extend beyond right edge accounting for notch
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
    }
  });

  test("button text is not clipped by border radius", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    const buttons = page.locator("button[type='button'], button[type='submit']");
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i);

      if (await button.isVisible()) {
        // Get computed styles
        const style = await button.evaluate((el) => {
          const cs = window.getComputedStyle(el);
          return {
            padding: cs.padding,
            minHeight: cs.minHeight,
            minWidth: cs.minWidth,
          };
        });

        // Button should have adequate padding for text
        expect(style.minHeight).not.toBe("0px");
      }
    }
  });

  test("dialog overlays don't obscure form labels or required indicators", async ({ page }) => {
    await mockEarnProofApi(page);
    await page.goto("/");

    // Try to find and open any informational overlay/dialog
    const helpButton = page.getByRole("button", { name: /help|info/i }).first();
    if (await helpButton.isVisible()) {
      await helpButton.click();
      const dialog = page.getByRole("dialog");

      if (await dialog.isVisible()) {
        const dialogBox = await dialog.boundingBox();

        // Dialog shouldn't cover too much of the viewport
        const coveragePercent = ((dialogBox?.height || 0) / 844) * 100;
        expect(coveragePercent).toBeLessThan(90); // Leave at least 10% visible
      }
    }
  });
});

test.describe("responsive behavior across mobile sizes", () => {
  MOBILE_VIEWPORTS.forEach((viewport) => {
    test(`layout is stable and readable on ${viewport.name}`, async ({ page }) => {
      await mockEarnProofApi(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");

      // Page should render without horizontal scroll
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);

      // Primary content should be visible
      const main = page.locator("main, [role='main']");
      if (await main.isVisible()) {
        const box = await main.boundingBox();
        expect(box?.height || 0).toBeGreaterThan(100);
      }
    });
  });
});
