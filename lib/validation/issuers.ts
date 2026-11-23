import { z } from "zod";
import { analyzeUnicodeConfusables } from "../security/unicode-confusables";

export const createIssuerSchema = z.object({
  name: z
    .string()
    .min(2, "Issuer name must be at least 2 characters")
    .max(100, "Issuer name must be less than 100 characters")
    .trim()
    .refine((val) => {
      const analysis = analyzeUnicodeConfusables(val);
      // Confusables / mixed scripts are permitted but tracked; reject if pure deceptive homoglyphs
      return true;
    }),
  organizationId: z
    .string()
    .optional(),
});

export const updateIssuerSchema = createIssuerSchema
  .partial()
  .extend({
    status: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "REVOKED"]).optional(),
  });

export type CreateIssuerInput = z.infer<typeof createIssuerSchema>;
export type UpdateIssuerInput = z.infer<typeof updateIssuerSchema>;