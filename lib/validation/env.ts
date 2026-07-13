import { z } from "zod";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_STELLAR_NETWORK: z.literal("testnet"),
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
});
