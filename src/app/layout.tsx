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
                    if (parsed && typeof parsed === 'object') {
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
                    for (var k in item) {
                      if (item[k] !== undefined) {
                        finalS[k] = item[k];
                      }
                    }
                  }
                  if (finalS.colorScheme) {
                    document.documentElement.setAttribute('data-theme', finalS.colorScheme);
                  }
                  if (finalS.textSize) {
                    document.documentElement.setAttribute('data-text-size', finalS.textSize);
                  }
                  if (finalS.activeApertureHeight) {
                    document.documentElement.setAttribute('data-aperture-height', String(finalS.activeApertureHeight));
                  }
                  if (finalS.pageMode) {
                    document.documentElement.setAttribute('data-page-mode', finalS.pageMode);
                  }
                  if (finalS.pageSize) {
                    document.documentElement.setAttribute('data-page-size', String(finalS.pageSize));
                  }
                  if (finalS.showStats !== undefined) {
                    document.documentElement.setAttribute('data-show-stats', String(finalS.showStats));
                  }
                  if (finalS.doubleSpaceLinebreaks !== undefined) {
                    document.documentElement.setAttribute('data-double-space', String(finalS.doubleSpaceLinebreaks));
                  }
                  if (candidates[0] && candidates[0].t) {
                    document.documentElement.setAttribute('data-updated-at', String(candidates[0].t));
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
