/**
 * Mobile viewport configurations for safe area and virtual keyboard testing.
 *
 * These configurations represent real devices and their safe area insets,
 * which are essential for mobile browsers with notches, rounded corners,
 * and software keyboards.
 *
 * Safe area insets are approximate but representative of how a browser would
 * apply viewport-fit=cover and position content to avoid obstruction.
 */

export interface MobileViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  // Safe area insets in CSS pixels (after scaling)
  safeArea: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  // Approximate virtual keyboard height in portrait
  keyboardHeightPortrait: number;
  // Approximate virtual keyboard height in landscape
  keyboardHeightLandscape: number;
  description?: string;
}

/**
 * Representative mobile devices commonly tested for responsive web apps.
 * Ordered by commonality and prioritized in test selection.
 */
export const MOBILE_VIEWPORTS: MobileViewportConfig[] = [
  {
    name: "iPhone 14 (390px)",
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    safeArea: { top: 47, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 280,
    keyboardHeightLandscape: 162,
    description: "Standard iPhone viewport, notched display, most common design target",
  },
  {
    name: "iPhone 14 Pro (393px with notch)",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    safeArea: { top: 59, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 280,
    keyboardHeightLandscape: 162,
    description: "Larger notch for Dynamic Island feature",
  },
  {
    name: "Pixel 5 (393px)",
    width: 393,
    height: 851,
    deviceScaleFactor: 2.75,
    safeArea: { top: 0, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 256,
    keyboardHeightLandscape: 192,
    description: "Android flagship with bottom nav safety area",
  },
  {
    name: "Pixel 6 Pro (412px)",
    width: 412,
    height: 915,
    deviceScaleFactor: 3.5,
    safeArea: { top: 0, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 280,
    keyboardHeightLandscape: 192,
    description: "Larger Android device with punch-hole camera",
  },
  {
    name: "Samsung Galaxy S23 (360px)",
    width: 360,
    height: 800,
    deviceScaleFactor: 2,
    safeArea: { top: 0, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 256,
    keyboardHeightLandscape: 192,
    description: "Smaller Android device for budget compatibility",
  },
  {
    name: "iPad Mini (768px tablet)",
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    safeArea: { top: 0, left: 0, right: 0, bottom: 0 },
    keyboardHeightPortrait: 320,
    keyboardHeightLandscape: 250,
    description: "Small tablet - should still be responsive at minimum",
  },
];

/**
 * Critical test configurations: devices that represent major OS/form factor
 * combinations and breakpoint scenarios. Used for focused suites that need
 * fast turnaround.
 */
export const CRITICAL_MOBILE_VIEWPORTS: MobileViewportConfig[] = [
  MOBILE_VIEWPORTS[0], // iPhone 14 - primary iOS target
  MOBILE_VIEWPORTS[2], // Pixel 5 - primary Android target
  MOBILE_VIEWPORTS[4], // Galaxy S23 - smallest common device
];

/**
 * Boundary test viewports: minimum and maximum sizes to test resilience
 * without covering every possible device.
 */
export const BOUNDARY_MOBILE_VIEWPORTS: MobileViewportConfig[] = [
  {
    name: "Minimum (320px WCAG reflow)",
    width: 320,
    height: 640,
    deviceScaleFactor: 1,
    safeArea: { top: 0, left: 0, right: 0, bottom: 32 },
    keyboardHeightPortrait: 240,
    keyboardHeightLandscape: 200,
    description: "WCAG minimum reflow width, not a real device but important boundary",
  },
  {
    name: "Large phone (430px)",
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    safeArea: { top: 0, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 320,
    keyboardHeightLandscape: 200,
    description: "Foldable or large phone edge case",
  },
];

/**
 * Common viewport heights for different scenarios, accounting for browser
 * chrome and system elements that reduce available viewport space.
 */
export const VIEWPORT_SCENARIOS = {
  portraitNormal: (vp: MobileViewportConfig) => ({
    width: vp.width,
    height: vp.height,
  }),
  portraitWithKeyboard: (vp: MobileViewportConfig) => ({
    width: vp.width,
    height: vp.height - vp.keyboardHeightPortrait,
  }),
  landscapeNormal: (vp: MobileViewportConfig) => ({
    width: vp.height,
    height: vp.width,
  }),
  landscapeWithKeyboard: (vp: MobileViewportConfig) => ({
    width: vp.height,
    height: vp.width - vp.keyboardHeightLandscape,
  }),
} as const;

/**
 * Helper to get safe area CSS variable declarations for a viewport.
 * Use with `page.evaluate()` to inject safe area awareness into tests.
 */
export function getSafeAreaCSS(viewport: MobileViewportConfig): string {
  const { top, left, right, bottom } = viewport.safeArea;
  return `
    :root {
      --safe-area-top: ${top}px;
      --safe-area-left: ${left}px;
      --safe-area-right: ${right}px;
      --safe-area-bottom: ${bottom}px;
      --keyboard-height: ${viewport.keyboardHeightPortrait}px;
    }
  `;
}

/**
 * CSS to apply safe area considerations to common UI patterns.
 * Useful for verifying the app already respects safe areas or injecting
 * safe area behavior into test scenarios.
 */
export const SAFE_AREA_AWARE_CSS = `
  header, nav {
    padding-top: max(0.5rem, var(--safe-area-top, 0px));
    padding-left: max(0.5rem, var(--safe-area-left, 0px));
    padding-right: max(0.5rem, var(--safe-area-right, 0px));
  }
  
  footer, [role="contentinfo"] {
    padding-bottom: max(0.5rem, var(--safe-area-bottom, 0px));
    padding-left: max(0.5rem, var(--safe-area-left, 0px));
    padding-right: max(0.5rem, var(--safe-area-right, 0px));
  }
  
  input:focus, textarea:focus {
    /* Scroll into view when focused, accounting for keyboard */
    scroll-margin-bottom: max(4rem, calc(var(--keyboard-height, 280px) + 1rem));
  }
  
  button[type="submit"], [role="button"]:last-child {
    /* Primary actions should not be hidden by keyboard */
    margin-bottom: max(0.5rem, var(--safe-area-bottom, 0px));
  }
`;

/**
 * Get safe area insets for a given viewport configuration.
 * Insets represent the "safe" region where content won't be obscured by
 * system UI (notches, rounded corners, etc.).
 */
export function getSafeAreaInsets(viewport: MobileViewportConfig) {
  return {
    top: `max(0.5rem, ${viewport.safeArea.top}px)`,
    left: `max(0.5rem, ${viewport.safeArea.left}px)`,
    right: `max(0.5rem, ${viewport.safeArea.right}px)`,
    bottom: `max(0.5rem, ${viewport.safeArea.bottom}px)`,
  };
}

/**
 * Apply viewport configuration and safe area settings to a Playwright page.
 * Simulates a real mobile device with appropriate scaling and safe area.
 */
export async function applyMobileViewport(
  page: import("@playwright/test").Page,
  viewport: MobileViewportConfig
): Promise<void> {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  // Inject safe area CSS variables and patterns
  await page.addStyleTag({
    content: getSafeAreaCSS(viewport) + "\n" + SAFE_AREA_AWARE_CSS,
  });
}

/**
 * Simulate a virtual keyboard appearing by reducing the viewport height.
 * Mimics what happens on iOS/Android when an input receives focus.
 */
export async function showVirtualKeyboard(
  page: import("@playwright/test").Page,
  viewport: MobileViewportConfig,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<void> {
  const keyboardHeight =
    orientation === "portrait" ? viewport.keyboardHeightPortrait : viewport.keyboardHeightLandscape;
  const currentSize = page.viewportSize();

  if (currentSize) {
    await page.setViewportSize({
      width: currentSize.width,
      height: Math.max(currentSize.height - keyboardHeight, 240), // Min height to avoid breaking layout
    });

    // Small delay to allow layout recalculation
    await page.waitForTimeout(100);
  }
}

/**
 * Simulate a virtual keyboard disappearing by returning to full viewport.
 */
export async function hideVirtualKeyboard(
  page: import("@playwright/test").Page,
  viewport: MobileViewportConfig,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<void> {
  const size = orientation === "portrait" ? "portraitNormal" : "landscapeNormal";
  const dims = VIEWPORT_SCENARIOS[size](viewport);
  await page.setViewportSize({
    width: dims.width,
    height: dims.height,
  });
  await page.waitForTimeout(100);
}
