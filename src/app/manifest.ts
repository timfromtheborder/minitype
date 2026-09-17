import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const basePath = process.env.GITHUB_PAGES === 'true' ? '/minitype' : '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Minitype - Distraction-Free Typewriter',
    short_name: 'Minitype',
    description: 'Distraction-free, forward-momentum writing web application modeled on mechanical typewriter constraints.',
    start_url: `${basePath}/`,
    display: 'standalone',
    background_color: '#F5F2EB',
    theme_color: '#F5F2EB',
    orientation: 'any',
    icons: [
      {
        src: `${basePath}/favicon-32x32.png`,
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: `${basePath}/apple-touch-icon.png`,
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: `${basePath}/android-chrome-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${basePath}/android-chrome-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
