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
                var candidates = [];
                function check(raw) {
                  if (!raw) return;
                  try {
                    var parsed = JSON.parse(raw);
                    if (parsed && (parsed.colorScheme || parsed.textSize)) {
                      candidates.push({ s: parsed, t: typeof parsed._updatedAt === 'number' ? parsed._updatedAt : 0 });
                    }
                  } catch (e) {}
                }
                try { check(localStorage.getItem('minitype_global_settings')); } catch (e) {}
                try { check(sessionStorage.getItem('minitype_global_settings')); } catch (e) {}
                try {
                  var match = document.cookie.match(/(?:^|; )minitype_global_settings=([^;]*)/);
                  if (match) check(decodeURIComponent(match[1]));
                } catch (e) {}
                try {
                  if (window.name && window.name.indexOf('minitype_settings:') === 0) {
                    check(window.name.slice(18));
                  }
                } catch (e) {}
                if (candidates.length > 0) {
                  candidates.sort(function(a, b) { return b.t - a.t; });
                  var finalS = {};
                  for (var i = candidates.length - 1; i >= 0; i--) {
                    var item = candidates[i].s;
                    if (item.colorScheme) finalS.colorScheme = item.colorScheme;
                    if (item.textSize) finalS.textSize = item.textSize;
                  }
                  if (finalS.colorScheme) {
                    document.documentElement.setAttribute('data-theme', finalS.colorScheme);
                  }
                  if (finalS.textSize) {
                    document.documentElement.setAttribute('data-text-size', finalS.textSize);
                  }
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
