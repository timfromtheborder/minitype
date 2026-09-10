import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isGithubPages ? '/minitype' : '',
  assetPrefix: isGithubPages ? '/minitype/' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
