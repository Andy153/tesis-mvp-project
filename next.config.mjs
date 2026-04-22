/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    // pdfjs-dist ships a node canvas binding that we don't need in the browser
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    // En macOS con muchos watchers (EMFILE) el HMR puede dejar de servir CSS bien al refrescar.
    // Polling evita depender solo de inotify/FSEvents y estabiliza `next dev`.
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1500,
        aggregateTimeout: 500,
      };
    }
    return config;
  },
};

export default nextConfig;
