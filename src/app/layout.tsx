import type { Metadata, Viewport } from "next";
import { Courier_Prime, Inter_Tight } from "next/font/google";
import { ZeroFOUCScript } from "@/components/ZeroFOUCScript";
import "./globals.css";

const courierPrime = Courier_Prime({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-courier-prime",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
});

const basePath = process.env.GITHUB_PAGES === "true" ? "/minitype" : "";

export const metadata: Metadata = {
  title: "minitype",
  description: "Distraction-free, forward-momentum writing web application modeled on mechanical typewriter constraints.",
  icons: {
    icon: [
      { url: `${basePath}/favicon-32x32.png`, sizes: "32x32", type: "image/png" },
      { url: `${basePath}/favicon.png`, type: "image/png" },
      { url: `${basePath}/android-chrome-512x512.png`, sizes: "512x512", type: "image/png" },
    ],
    shortcut: `${basePath}/favicon-32x32.png`,
    apple: [
      { url: `${basePath}/apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "minitype",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${courierPrime.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <ZeroFOUCScript />
        <div
          id="minitype-startup-veil"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'var(--background)',
            pointerEvents: 'none',
            transition: 'opacity 160ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          aria-hidden="true"
        />
        {children}
      </body>
    </html>
  );
}
