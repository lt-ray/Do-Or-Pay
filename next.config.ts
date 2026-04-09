import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時のスマホアクセス許可（前回追加した部分）
  allowedDevOrigins: ["192.168.3.30"],
  
  // ★追加：静的エクスポートを有効化
  output: "export",
  
  // ★追加：静的エクスポート時に画像最適化をオフにする（必須）
  images: {
    unoptimized: true,
  },
};

export default nextConfig;