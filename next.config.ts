import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false, // 动画站点关掉严格模式的双次挂载，避免时间线被初始化两次
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
