import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Apache XAMPP meneruskan aplikasi ini melalui /stationaryapps.
  basePath: "/stationaryapps",
  // Samakan URL berakhiran slash dengan RedirectMatch Apache.
  trailingSlash: true,
};

export default nextConfig;
