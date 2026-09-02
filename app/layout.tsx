import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WebVitalsReporter } from "@/components/common/web-vitals-reporter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EarnProof",
  description:
    "Privacy-preserving income and payment verification on Stellar testnet.",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

// Nonce-based CSP requires request-time rendering so Next can tag its
// framework scripts and inline bootstrap with the per-request nonce.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
