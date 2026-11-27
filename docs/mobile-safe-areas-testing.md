# Mobile Safe Areas and Virtual Keyboard Layout Testing

This document describes the mobile safe area and virtual keyboard testing suite added to EarnProof to ensure primary actions remain visible and interactive on notched devices, with virtual keyboards, and across various mobile viewport configurations.

## Overview

Mobile browsers present unique challenges for web applications:

1. **Notches and Rounded Corners**: iPhone and modern Android devices have notches or punch-hole cameras that create "safe areas" where content should not be placed
2. **Virtual Keyboards**: On-screen keyboards reduce available viewport height when form inputs receive focus, potentially hiding interactive elements
3. **Orientation Changes**: Users can rotate their device, requiring layout to reflow dynamically
4. **Pinch Zoom**: Users can zoom content, which must remain readable and interactive without requiring horizontal scrolling
5. **System UI**: Status bars, home indicators, and other system elements constrain the usable viewport

## Implementation

### CSS Changes (app/globals.css)

Added mobile safe area support using CSS Environment Variables and the `max()` function:

```css
@supports (padding: max(0px)) {
  body {
    padding-left: max(0, env(safe-area-inset-left));
    padding-right: max(0, env(safe-area-inset-right));
    padding-top: max(0, env(safe-area-inset-top));
    padding-bottom: max(0, env(safe-area-inset-bottom));
  }

  header, [role="banner"] {
    padding-top: max(0.5rem, env(safe-area-inset-top));
    padding-left: max(0.5rem, env(safe-area-inset-left));
    padding-right: max(0.5rem, env(safe-area-inset-right));
  }

  input:focus, textarea:focus {
    scroll-margin-bottom: max(4rem, calc(var(--keyboard-height, 280px) + 1rem));
  }
}
```

**Benefits:**
- Content automatically respects notches and safe areas on devices that support `env(safe-area-inset-*)`
- Focused form inputs scroll into view, accounting for virtual keyboard height
- Uses `max()` to ensure minimum padding even on devices without safe area support
- Backward-compatible with older browsers (uses `@supports` feature query)

### Viewport Metadata (app/layout.tsx)

Updated the metadata viewport configuration to support notched devices:

```typescript
viewport: {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover", // Support for notched devices
}
```

**Key settings:**
- `viewportFit: "cover"`: Allows content to extend into safe areas (with CSS handling the positioning)
- `userScalable: true`: Permits pinch zoom while maintaining readability
- `maximumScale: 5`: Reasonable zoom limit

### Test Fixtures (e2e/fixtures/mobile-viewports.ts)

Comprehensive mobile viewport configurations representing real devices:

```typescript
export const MOBILE_VIEWPORTS: MobileViewportConfig[] = [
  {
    name: "iPhone 14 (390px)",
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    safeArea: { top: 47, left: 0, right: 0, bottom: 34 },
    keyboardHeightPortrait: 280,
    keyboardHeightLandscape: 162,
  },
  // ... more devices
];
```

**Includes:**
- iPhone 14 (standard notch)
- iPhone 14 Pro (Dynamic Island)
- Pixel 5 (Android reference)
- Pixel 6 Pro (larger Android)
- Samsung Galaxy S23 (budget device)
- iPad Mini (small tablet)

**Boundary configurations:**
- Minimum: 320px (WCAG reflow standard)
- Maximum: 430px (large phone edge case)

**Helper functions:**
- `applyMobileViewport()`: Set viewport and inject safe area CSS
- `showVirtualKeyboard()`: Reduce height to simulate keyboard
- `hideVirtualKeyboard()`: Restore full height
- `getSafeAreaCSS()`: Generate safe area CSS variables

### Test Suite (e2e/accessibility/mobile-safe-areas.spec.ts)

Comprehensive tests organized into focused describe blocks:

#### 1. Mobile Safe Areas
- Primary navigation visible and clickable without notch overlap
- Bottom action buttons avoid virtual keyboard space
- Form inputs not clipped by rounded corners
- Dialogs positioned within safe area

#### 2. Virtual Keyboard Interactions
- Form input gains focus without being obscured
- Keyboard resizing doesn't hide primary actions
- Form submission works after keyboard interaction

#### 3. Orientation Changes with Virtual Keyboard
- Portrait to landscape preserves layout without text overlap
- Landscape mode with keyboard leaves primary actions visible

#### 4. Zoom and Pinch Interactions
- Page remains readable and controls accessible at 150% zoom
- Form inputs remain functional after zoom reset

#### 5. Boundary Conditions
- Minimum safe viewport (320px) shows primary navigation
- Maximum common mobile viewport (430px) shows full layout
- Primary action remains accessible with keyboard at minimum width

#### 6. Authorization and Privacy Preservation
- Safe area behavior doesn't bypass authentication checks
- Virtual keyboard doesn't expose sensitive form data

#### 7. Regression: No Text Clipping or Overlaps
- Navigation text not clipped by notch
- Button text not clipped by border radius
- Dialog overlays don't obscure form labels

#### 8. Responsive Behavior Across Mobile Sizes
- Layout stable and readable on all configured viewports

## Test Execution

### Run All Mobile Safe Area Tests

```bash
npm run test:e2e:a11y
```

This runs the entire accessibility suite including mobile safe area tests.

### Run Only Mobile Safe Area Tests

```bash
npx playwright test e2e/accessibility/mobile-safe-areas.spec.ts
```

### Run Specific Test Group

```bash
npx playwright test e2e/accessibility/mobile-safe-areas.spec.ts -g "virtual keyboard"
```

### Run with Debug Output

```bash
npx playwright test e2e/accessibility/mobile-safe-areas.spec.ts --debug
```

### Generate HTML Report

```bash
npx playwright show-report
```

## Device Coverage

The test suite covers:

| Device | Width | Height | Use Case |
|--------|-------|--------|----------|
| iPhone 14 | 390px | 844px | Primary iOS target with notch |
| iPhone 14 Pro | 393px | 852px | Larger notch (Dynamic Island) |
| Pixel 5 | 393px | 851px | Primary Android target |
| Pixel 6 Pro | 412px | 915px | Larger Android device |
| Galaxy S23 | 360px | 800px | Smaller device compatibility |
| iPad Mini | 768px | 1024px | Minimum tablet size |
| Minimum (WCAG) | 320px | 640px | Boundary condition |
| Maximum | 430px | 932px | Large phone edge case |

## Virtual Keyboard Scenarios

For each device, tests cover:

1. **Portrait (normal)**: Full viewport height
2. **Portrait (keyboard active)**: Height reduced by keyboard
3. **Landscape (normal)**: Rotated orientation
4. **Landscape (keyboard active)**: Rotated with reduced height

Approximate keyboard heights:
- iPhone: 280px (portrait), 162px (landscape)
- Android: 256-280px (portrait), 192px (landscape)

## Acceptance Criteria Verification

### ✓ Primary Actions Remain Visible
- Tests verify submit buttons are within viewport after keyboard appears
- Tests check navigation remains clickable at all viewport sizes
- Tests confirm actions stay in view during rotation and zoom

### ✓ No Text or Controls Overlapping
- Tests check bounding boxes for clipping by notches
- Tests verify button text has adequate padding
- Tests ensure dialog overlays don't exceed 90% of viewport
- Tests confirm form labels aren't obscured by system UI

### ✓ Deterministic, Bounded, Observable
- Tests use fixed viewport sizes (not random or device-dependent)
- Tests check specific element positions and visibility
- Tests generate observable failures with element references

### ✓ Compatible with Existing Authorization and Privacy
- Tests verify protected routes still require authentication
- Tests check sensitive data visibility doesn't change with keyboard
- Tests preserve existing security model

## Regression Testing

The suite catches regressions such as:

- Notch content displacement
- Primary buttons hidden by keyboard
- Horizontal scrolling at minimum widths
- Text clipping at zoom levels
- Focus not scrolling into view
- Layout breaking on orientation change
- Dialog placement blocking content

## Browser Support

- **Chrome 90+**: Full support for safe area insets
- **Safari 13+**: Full support for safe area insets
- **Firefox 87+**: Safe area support (with `viewport-fit: cover`)
- **Edge 90+**: Full support via Chromium

Older browsers gracefully degrade with fallback padding and normal viewport behavior.

## Related Files

- **Test**: `e2e/accessibility/mobile-safe-areas.spec.ts`
- **Fixtures**: `e2e/fixtures/mobile-viewports.ts`
- **CSS**: `app/globals.css` (safe area padding rules)
- **Metadata**: `app/layout.tsx` (viewport configuration)
- **Config**: `playwright.a11y.config.ts` (test configuration)

## Running the Full Validation Suite

```bash
npm run lint
npm test
npm run build
npm run test:e2e:a11y
```

This validates:
1. ESLint compliance
2. Jest unit tests
3. TypeScript compilation
4. E2E accessibility tests (including mobile safe areas)

## Future Enhancements

Potential additions to this test suite:

1. **Screen Reader Announcement**: Verify content position changes don't break screen reader navigation
2. **Real Device Testing**: Use BrowserStack/Sauce Labs for actual device testing
3. **Foldable Device Support**: Test CSS Regions and viewport-segments
4. **Landscape Zoom**: Additional zoom scenarios in landscape orientation
5. **Custom Keyboard Heights**: Allow per-app keyboard size customization
6. **Haptic Feedback**: Verify button interactions trigger system feedback

## References

- [MDN: viewport-fit](https://developer.mozilla.org/en-US/docs/Web/CSS/viewport-fit)
- [MDN: env() safe-area-inset](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Apple: Support for Notched iPhone](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [WCAG: Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [MDN: Virtual Keyboard API](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboardAPI)
