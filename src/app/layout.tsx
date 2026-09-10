import type { Metadata, Viewport } from "next";
import { Courier_Prime, Inter_Tight } from "next/font/google";
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
      { url: `${basePath}/favicon.svg`, type: "image/svg+xml" },
      { url: `${basePath}/favicon.png`, type: "image/png" },
      { url: `${basePath}/favicon.ico` },
    ],
    shortcut: `${basePath}/favicon.ico`,
    apple: `${basePath}/apple-touch-icon.png`,
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
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${courierPrime.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
