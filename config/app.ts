export const appConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
  stellarNetwork: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
  stellarNetworkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
} as const;
