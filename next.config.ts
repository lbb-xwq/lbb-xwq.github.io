import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false, // 动画站点关掉严格模式的双次挂载，避免时间线被初始化两次
  eslint: { ignoreDuringBuilds: true },
  // GitHub Pages 只托管静态文件，需要纯静态产物
  output: 'export',
  // 导出成 about/index.html 这类目录结构，Pages 上的无扩展名 URL 才会稳定命中
  trailingSlash: true,
  // 静态导出没有 Next 的图片优化服务，必须关掉
  images: { unoptimized: true },
};

export default nextConfig;
