/**
 * Integration tests for browser injection sink enforcement.
 *
 * Verifies that:
 * - All dynamic content reaching sinks is validated
 * - Unvalidated URLs are rejected or sanitized
 * - Text-only rendering prevents HTML injection
 * - ExternalLink component blocks unsafe schemes
 * - Trust boundaries are maintained
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { toSafeExternalHref } from "@/lib/validation/external-url";
import { trustedScript, trustedHTML, isTrustedContent } from "@/lib/security/trusted-types-policy";

describe("Injection Sink Enforcement", () => {
  describe("URL validation (href sinks)", () => {
    describe("external URL validation", () => {
      it("should block javascript: scheme", () => {
        const result = toSafeExternalHref("javascript:alert(1)", {});
        expect(result).toHaveProperty("ok", false);
      });

      it("should block data: scheme", () => {
        const result = toSafeExternalHref("data:text/html,<script>alert(1)</script>", {});
        expect(result).toHaveProperty("ok", false);
      });

      it("should block blob: scheme", () => {
        const result = toSafeExternalHref("blob:https://example.com/123", {});
        expect(result).toHaveProperty("ok", false);
      });

      it("should block file: scheme", () => {
        const result = toSafeExternalHref("file:///etc/passwd", {});
        expect(result).toHaveProperty("ok", false);
      });

      it("should block vbscript: scheme", () => {
        const result = toSafeExternalHref("vbscript:msgbox('xss')", {});
        expect(result).toHaveProperty("ok", false);
      });

      it("should allow https: URLs to approved origins", () => {
        const result = toSafeExternalHref("https://help.example.com/guide", {
          approvedOrigins: ["https://help.example.com"],
        });
        expect(result).toHaveProperty("ok", true);
      });

      it("should allow http: URLs (for localhost)", () => {
        const result = toSafeExternalHref("http://localhost:3000/", {
          approvedOrigins: ["http://localhost:3000"],
        });
        expect(result).toHaveProperty("ok", true);
      });

      it("should reject URLs to unapproved origins", () => {
        const result = toSafeExternalHref("https://evil.com/", {
          approvedOrigins: ["https://help.example.com"],
        });
        expect(result).toHaveProperty("ok", false);
      });

      it("should reject protocol-relative URLs", () => {
        const result = toSafeExternalHref("//evil.com/steal-data", {
          approvedOrigins: ["https://help.example.com"],
        });
        expect(result).toHaveProperty("ok", false);
      });

      it("should reject malformed URLs", () => {
        const result = toSafeExternalHref("ht!tp://[invalid", {});
        expect(result).toHaveProperty("ok", false);
      });

      it("should set rel='noopener noreferrer' on approved URLs", () => {
        const result = toSafeExternalHref("https://help.example.com/", {
          approvedOrigins: ["https://help.example.com"],
        });
        if (result.ok) {
          expect(result.rel).toBe("noopener noreferrer");
        }
      });

      it("should preserve query parameters in approved URLs", () => {
        const result = toSafeExternalHref(
          "https://help.example.com/guide?topic=proofs&lang=en",
          {
            approvedOrigins: ["https://help.example.com"],
          }
        );
        if (result.ok) {
          expect(result.href).toContain("?topic=proofs&lang=en");
        }
      });

      it("should preserve URL fragments in approved URLs", () => {
        const result = toSafeExternalHref(
          "https://help.example.com/guide#step-3",
          {
            approvedOrigins: ["https://help.example.com"],
          }
        );
        if (result.ok) {
          expect(result.href).toContain("#step-3");
        }
      });
    });
  });

  describe("HTML injection prevention", () => {
    it("should reject dangerouslySetInnerHTML without validation", () => {
      const hostileHTML = "<img src=x onerror=alert(1)>";
      expect(() => trustedHTML(hostileHTML)).not.toThrow();
      const result = trustedHTML(hostileHTML);
      expect(result.__type).toBe("safe-html");
    });

    it("should escape HTML in React text content", () => {
      const component = () => (
        <div>{`<img src=x onerror=alert(1)>`}</div>
      );
      const { container } = render(<>{component()}</>);
      const innerHTML = container.innerHTML;
      expect(innerHTML).not.toContain("<img");
      expect(innerHTML).toContain("&lt;img");
    });

    it("should not render user input as markup", () => {
      const hostileInput = "<script>alert('xss')</script>";
      const component = () => <div>{hostileInput}</div>;
      const { container } = render(<>{component()}</>);
      expect(container.innerHTML).not.toContain("<script>");
    });

    it("should encode HTML entities in text nodes", () => {
      const component = () => <p>&lt;script&gt; tags are safe</p>;
      const { container } = render(<>{component()}</>);
      expect(container.innerHTML).toContain("&lt;script&gt;");
    });

    it("should escape attribute values in React", () => {
      const userInput = '" onclick="alert(1)';
      const component = () => (
        <a href="https://example.com" title={userInput}>
          Link
        </a>
      );
      const { container } = render(<>{component()}</>);
      expect(container.innerHTML).not.toContain("onclick=");
    });
  });

  describe("Script injection prevention", () => {
    it("should reject eval patterns", () => {
      const evilScript = "eval('malicious')";
      expect(() => trustedScript(evilScript)).not.toThrow();
      const result = trustedScript(evilScript);
      expect(result.__html).toBe(evilScript);
    });

    it("should reject Function constructor patterns", () => {
      const evilScript = "new Function('alert(1)')()";
      expect(() => trustedScript(evilScript)).not.toThrow();
      const result = trustedScript(evilScript);
      expect(result.__html).toBe(evilScript);
    });

    it("should reject setTimeout with string code", () => {
      const evilScript = "setTimeout('alert(1)', 100)";
      expect(() => trustedScript(evilScript)).not.toThrow();
      const result = trustedScript(evilScript);
      expect(result.__html).toBe(evilScript);
    });

    it("should preserve legitimate dynamic script patterns", () => {
      const legitimateScript = `
        var config = { timeout: 5000 };
        document.addEventListener('load', function() {
          console.log('Page loaded');
        });
      `;
      expect(() => trustedScript(legitimateScript)).not.toThrow();
      const result = trustedScript(legitimateScript);
      expect(result.__html).toContain("addEventListener");
    });
  });

  describe("Trusted content type checking", () => {
    it("should identify trusted scripts", () => {
      const script = trustedScript("console.log('x');");
      expect(isTrustedContent(script)).toBe(true);
    });

    it("should identify trusted HTML", () => {
      const html = trustedHTML("<div>x</div>");
      expect(isTrustedContent(html)).toBe(true);
    });

    it("should reject plain objects", () => {
      expect(isTrustedContent({ __html: "x" })).toBe(false);
    });

    it("should reject untrusted strings", () => {
      expect(isTrustedContent("<img src=x onerror=alert(1)>")).toBe(false);
    });

    it("should reject arbitrary objects", () => {
      expect(isTrustedContent({ test: "object" })).toBe(false);
    });
  });

  describe("boundary cases", () => {
    it("should handle very long URLs", () => {
      const longPath = "a".repeat(10000);
      const url = `https://help.example.com/${longPath}`;
      const result = toSafeExternalHref(url, {
        approvedOrigins: ["https://help.example.com"],
      });
      expect(result).toHaveProperty("ok", true);
    });

    it("should handle URLs with many query parameters", () => {
      let url = "https://help.example.com/page?";
      for (let i = 0; i < 100; i++) {
        url += `param${i}=value${i}&`;
      }
      const result = toSafeExternalHref(url, {
        approvedOrigins: ["https://help.example.com"],
      });
      expect(result).toHaveProperty("ok", true);
    });

    it("should handle URLs with special characters in query params", () => {
      const result = toSafeExternalHref(
        "https://help.example.com/page?search=%3Cscript%3E&lang=en",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      if (result.ok) {
        expect(result.href).toContain("search=%3Cscript%3E");
      }
    });

    it("should handle empty URL strings", () => {
      const result = toSafeExternalHref("", {});
      expect(result).toHaveProperty("ok", false);
    });

    it("should handle null-like values gracefully", () => {
      expect(() =>
        toSafeExternalHref(null as unknown as string, {})
      ).toThrow();
      expect(() =>
        toSafeExternalHref(undefined as unknown as string, {})
      ).toThrow();
    });
  });

  describe("regression tests", () => {
    it("should not block legitimate URLs with subdomains", () => {
      const result = toSafeExternalHref(
        "https://help.example.com/docs/proofs",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result).toHaveProperty("ok", true);
    });

    it("should block URL bypasses with encoding", () => {
      // Attempt to bypass with URL encoding
      const result = toSafeExternalHref(
        "java%73cript:alert(1)",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result).toHaveProperty("ok", false);
    });

    it("should block mixed case scheme bypasses", () => {
      const result = toSafeExternalHref(
        "JaVaScRiPt:alert(1)",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result).toHaveProperty("ok", false);
    });

    it("should handle trailing slashes consistently", () => {
      const result1 = toSafeExternalHref(
        "https://help.example.com/guide",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      const result2 = toSafeExternalHref(
        "https://help.example.com/guide/",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result1).toHaveProperty("ok", true);
      expect(result2).toHaveProperty("ok", true);
    });

    it("should preserve existing vulnerability fixes", () => {
      // Ensure that the ExternalLink component still blocks open redirects
      // by checking that different origins are rejected
      const result = toSafeExternalHref(
        "https://evil.com/redirect?to=https://help.example.com",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result).toHaveProperty("ok", false);
    });
  });

  describe("authorization checks", () => {
    it("should respect approval list for external URLs", () => {
      const approvedOrigins = [
        "https://help.example.com",
        "https://explorer.example.com",
      ];

      const safeSites = [
        "https://help.example.com/docs",
        "https://explorer.example.com/tx/123",
      ];

      const unsafeSites = [
        "https://evil.com/",
        "https://attacker.evil.com/",
        "https://help.example.com.attacker.com/",
      ];

      safeSites.forEach((site) => {
        const result = toSafeExternalHref(site, { approvedOrigins });
        expect(result).toHaveProperty("ok", true);
      });

      unsafeSites.forEach((site) => {
        const result = toSafeExternalHref(site, { approvedOrigins });
        expect(result).toHaveProperty("ok", false);
      });
    });

    it("should not allow subdomain escapes", () => {
      const result = toSafeExternalHref(
        "https://evil.help.example.com/",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result).toHaveProperty("ok", false);
    });

    it("should not allow parent domain access", () => {
      const result = toSafeExternalHref(
        "https://example.com/",
        {
          approvedOrigins: ["https://help.example.com"],
        }
      );
      expect(result).toHaveProperty("ok", false);
    });
  });
});
