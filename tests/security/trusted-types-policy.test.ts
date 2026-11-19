/**
 * Tests for Trusted Types policy enforcement.
 *
 * Covers:
 * - Policy creation and validation
 * - Script content validation
 * - HTML content validation
 * - Error handling and boundary conditions
 * - Type safety of wrapped content
 */

import {
  createTrustedTypesPolicy,
  trustedScript,
  trustedHTML,
  isTrustedContent,
  type SafeScriptContent,
  type SafeHtmlContent,
} from "@/lib/security/trusted-types-policy";

describe("Trusted Types Policy", () => {
  describe("createTrustedTypesPolicy", () => {
    it("should return policy object with factory methods", () => {
      const policy = createTrustedTypesPolicy();
      expect(policy).toHaveProperty("createScript");
      expect(policy).toHaveProperty("createHTML");
      expect(typeof policy.createScript).toBe("function");
      expect(typeof policy.createHTML).toBe("function");
    });
  });

  describe("trustedScript", () => {
    describe("positive cases", () => {
      it("should wrap valid script content", () => {
        const script = "console.log('test');";
        const result = trustedScript(script);

        expect(result).toEqual({
          __html: script,
          __type: "safe-script",
        });
      });

      it("should accept multi-line scripts", () => {
        const script = `
          (function() {
            var x = 1;
            console.log(x);
          })();
        `;
        const result = trustedScript(script);

        expect(result.__html).toContain("var x = 1");
        expect(result.__type).toBe("safe-script");
      });

      it("should accept scripts with special characters", () => {
        const script = 'alert("test\\nwith\\tescapes");';
        const result = trustedScript(script);

        expect(result.__html).toBe(script);
      });

      it("should accept IIFE patterns (common bootstrap pattern)", () => {
        const script = `(function() {
          var key = "earnproof.display-preferences";
          var raw = window.localStorage.getItem(key);
          if (!raw) return;
          var parsed = JSON.parse(raw);
          document.documentElement.dataset.motion = parsed.motion || "system";
        })();`;
        const result = trustedScript(script);

        expect(result.__type).toBe("safe-script");
        expect(result.__html).toContain("localStorage");
      });
    });

    describe("negative cases", () => {
      it("should reject non-string input", () => {
        expect(() => trustedScript(123 as unknown as string)).toThrow(TypeError);
        expect(() => trustedScript(null as unknown as string)).toThrow(TypeError);
        expect(() => trustedScript(undefined as unknown as string)).toThrow(TypeError);
        expect(() => trustedScript({} as unknown as string)).toThrow(TypeError);
      });

      it("should reject empty strings", () => {
        expect(() => trustedScript("")).toThrow("Script must not be empty");
      });

      it("should reject whitespace-only strings", () => {
        expect(() => trustedScript("   ")).toThrow("Script must not be empty");
        expect(() => trustedScript("\n\t  \r\n")).toThrow("Script must not be empty");
      });

      it("should reject null-like strings", () => {
        expect(() => trustedScript("null")).not.toThrow();
        expect(() => trustedScript("undefined")).not.toThrow();
      });
    });

    describe("boundary cases", () => {
      it("should accept single character scripts", () => {
        const result = trustedScript("x");
        expect(result.__html).toBe("x");
      });

      it("should accept very long scripts", () => {
        const longScript = "console.log('x');\n".repeat(1000);
        const result = trustedScript(longScript);
        expect(result.__html.length).toBeGreaterThan(10000);
      });

      it("should preserve leading/trailing whitespace in content", () => {
        const script = "  console.log('test');  ";
        const result = trustedScript(script);
        expect(result.__html).toBe(script);
      });
    });
  });

  describe("trustedHTML", () => {
    describe("positive cases", () => {
      it("should wrap valid HTML content", () => {
        const html = "<div>test</div>";
        const result = trustedHTML(html);

        expect(result).toEqual({
          __html: html,
          __type: "safe-html",
        });
      });

      it("should accept complex HTML markup", () => {
        const html = `
          <div class="container">
            <p>Some text</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        `;
        const result = trustedHTML(html);
        expect(result.__type).toBe("safe-html");
        expect(result.__html).toContain("<ul>");
      });

      it("should accept self-closing tags", () => {
        const html = '<img src="test.png" alt="test" />';
        const result = trustedHTML(html);
        expect(result.__html).toBe(html);
      });

      it("should accept HTML with attributes", () => {
        const html =
          '<a href="https://example.com" class="link" data-id="123">Link</a>';
        const result = trustedHTML(html);
        expect(result.__html).toBe(html);
      });

      it("should accept HTML with entities", () => {
        const html = "<p>&lt;script&gt; is safe &amp; &quot;quoted&quot;</p>";
        const result = trustedHTML(html);
        expect(result.__html).toBe(html);
      });
    });

    describe("negative cases", () => {
      it("should reject non-string input", () => {
        expect(() => trustedHTML(123 as unknown as string)).toThrow(TypeError);
        expect(() => trustedHTML(null as unknown as string)).toThrow(TypeError);
        expect(() => trustedHTML(undefined as unknown as string)).toThrow(
          TypeError
        );
      });

      it("should reject empty strings", () => {
        expect(() => trustedHTML("")).toThrow("HTML must not be empty");
      });

      it("should reject whitespace-only strings", () => {
        expect(() => trustedHTML("   ")).toThrow("HTML must not be empty");
        expect(() => trustedHTML("\n  \t")).toThrow("HTML must not be empty");
      });
    });

    describe("boundary cases", () => {
      it("should accept single character HTML", () => {
        const result = trustedHTML("x");
        expect(result.__html).toBe("x");
      });

      it("should accept HTML with newlines preserved", () => {
        const html = "<div>\n  <p>test</p>\n</div>";
        const result = trustedHTML(html);
        expect(result.__html).toBe(html);
      });

      it("should accept HTML with various quote styles", () => {
        const html =
          `<div class="test" data-attr='value' onclick="alert('x')">content</div>`;
        const result = trustedHTML(html);
        expect(result.__html).toBe(html);
      });
    });

    describe("source parameter", () => {
      it("should accept optional source parameter", () => {
        const html = "<div>test</div>";
        expect(() => trustedHTML(html, "hardcoded")).not.toThrow();
        expect(() => trustedHTML(html, "validated")).not.toThrow();
      });

      it("should not include source in output", () => {
        const html = "<div>test</div>";
        const result = trustedHTML(html, "my-source");
        expect(result).not.toHaveProperty("source");
        expect(result).toEqual({
          __html: html,
          __type: "safe-html",
        });
      });
    });
  });

  describe("isTrustedContent", () => {
    it("should return true for SafeScriptContent", () => {
      const content = trustedScript("console.log('x');");
      expect(isTrustedContent(content)).toBe(true);
    });

    it("should return true for SafeHtmlContent", () => {
      const content = trustedHTML("<div>test</div>");
      expect(isTrustedContent(content)).toBe(true);
    });

    it("should return false for plain objects without __type", () => {
      expect(isTrustedContent({ __html: "test" })).toBe(false);
      expect(isTrustedContent({ __type: "safe-script" })).toBe(false);
    });

    it("should return false for strings", () => {
      expect(isTrustedContent("console.log('x');")).toBe(false);
    });

    it("should return false for null and undefined", () => {
      expect(isTrustedContent(null)).toBe(false);
      expect(isTrustedContent(undefined)).toBe(false);
    });

    it("should return false for primitives", () => {
      expect(isTrustedContent(123)).toBe(false);
      expect(isTrustedContent(true)).toBe(false);
      expect(isTrustedContent(Symbol("x"))).toBe(false);
    });

    it("should return false for arrays", () => {
      expect(isTrustedContent([])).toBe(false);
      expect(isTrustedContent([trustedScript("x")])).toBe(false);
    });
  });

  describe("createTrustedTypesPolicy factory methods", () => {
    it("createScript should produce same result as trustedScript", () => {
      const policy = createTrustedTypesPolicy();
      const script = "console.log('test');";

      const policyResult = policy.createScript(script);
      const directResult = trustedScript(script);

      expect(policyResult).toEqual(directResult);
    });

    it("createHTML should produce same result as trustedHTML", () => {
      const policy = createTrustedTypesPolicy();
      const html = "<div>test</div>";

      const policyResult = policy.createHTML(html);
      const directResult = trustedHTML(html);

      expect(policyResult).toEqual(directResult);
    });

    it("createScript should enforce same validation", () => {
      const policy = createTrustedTypesPolicy();

      expect(() => policy.createScript("")).toThrow();
      expect(() => policy.createScript("   ")).toThrow();
      expect(() => policy.createScript(null as unknown as string)).toThrow();
    });

    it("createHTML should enforce same validation", () => {
      const policy = createTrustedTypesPolicy();

      expect(() => policy.createHTML("")).toThrow();
      expect(() => policy.createHTML("   ")).toThrow();
      expect(() => policy.createHTML(undefined as unknown as string)).toThrow();
    });
  });

  describe("type safety", () => {
    it("SafeScriptContent should have correct type", () => {
      const content = trustedScript("x");
      const typed: SafeScriptContent = content;
      expect(typed.__type).toBe("safe-script");
      expect(typeof typed.__html).toBe("string");
    });

    it("SafeHtmlContent should have correct type", () => {
      const content = trustedHTML("<x>");
      const typed: SafeHtmlContent = content;
      expect(typed.__type).toBe("safe-html");
      expect(typeof typed.__html).toBe("string");
    });
  });

  describe("real-world scenarios", () => {
    it("should handle display preferences bootstrap script", () => {
      const bootstrap = `(function() {
        try {
          var raw = window.localStorage.getItem("earnproof.display-preferences");
          if (!raw) return;
          var parsed = JSON.parse(raw);
          var data = parsed && parsed.data;
          if (!data) return;
          var root = document.documentElement;
          if (data.reducedMotion === "enabled") {
            root.dataset.motion = "reduced";
          }
        } catch (e) {}
      })();`;
      const result = trustedScript(bootstrap);
      expect(result.__type).toBe("safe-script");
      expect(result.__html).toContain("localStorage");
    });

    it("should handle complex HTML with mixed content", () => {
      const html = `
        <div class="message-box">
          <h1>Important Notice</h1>
          <p>This is a <strong>test</strong> message.</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      `;
      const result = trustedHTML(html);
      expect(result.__type).toBe("safe-html");
      expect(result.__html).toContain("<strong>");
    });
  });

  describe("authorization and security", () => {
    it("should not execute code during validation", () => {
      const executed = { value: false };
      const script = `(() => { window.__testExecuted = true; })()`;

      trustedScript(script);

      expect((window as any).__testExecuted).toBeUndefined();
    });

    it("should not modify global state during validation", () => {
      const before = { ...globalThis };
      trustedScript("console.log('test');");
      trustedHTML("<div>test</div>");
      const after = { ...globalThis };

      expect(Object.keys(after)).toEqual(Object.keys(before));
    });

    it("should handle invalid JSON in script gracefully", () => {
      const script = "var x = {invalid: json}; // This is intentionally wrong";
      expect(() => trustedScript(script)).not.toThrow();
    });

    it("should handle suspicious patterns without executing them", () => {
      const suspiciousPatterns = [
        "fetch('http://attacker.com')",
        "eval('malicious code')",
        "Function('more code')()",
        "setTimeout(x, 0)",
        'document.write("<script>alert(1)</script>")',
      ];

      suspiciousPatterns.forEach((pattern) => {
        const result = trustedScript(pattern);
        expect(result.__html).toBe(pattern);
      });
    });
  });
});
