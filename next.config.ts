import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Ignore canvas and other Node.js specific modules for pdfjs-dist
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
}

export default nextConfig
