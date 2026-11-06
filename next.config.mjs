/** @type {import('next').NextConfig} */
const nextConfig = {
  // Baseline hardening headers. HSTS and CSP stay deploy-time decisions
  // (the World ID widget flow must be re-tested against any CSP).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
