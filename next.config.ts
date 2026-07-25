import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  devIndicators: false,
  output: "standalone",
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows file locking was corrupting the persisted webpack cache
      // and causing broken client manifests / missing chunk errors.
      config.cache = false;
    }

    return config;
  },
};

export default nextConfig;
