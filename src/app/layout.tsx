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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${interTight.variable} ${courierPrime.variable} h-full antialiased font-sans`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var raw = null;
                try { raw = localStorage.getItem('minitype_global_settings'); } catch (e) {}
                if (!raw) {
                  try { raw = sessionStorage.getItem('minitype_global_settings'); } catch (e) {}
                }
                if (!raw) {
                  try {
                    var match = document.cookie.match(/(?:^|; )minitype_global_settings=([^;]*)/);
                    if (match) raw = decodeURIComponent(match[1]);
                  } catch (e) {}
                }
                if (!raw) {
                  try {
                    if (window.name && window.name.indexOf('minitype_settings:') === 0) {
                      raw = window.name.slice(18);
                    }
                  } catch (e) {}
                }
                if (raw) {
                  try {
                    var s = JSON.parse(raw);
                    if (s && s.colorScheme) {
                      document.documentElement.setAttribute('data-theme', s.colorScheme);
                    }
                    if (s && s.textSize) {
                      document.documentElement.setAttribute('data-text-size', s.textSize);
                    }
                  } catch (e) {}
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>{children}</body>
    </html>
  );
}
