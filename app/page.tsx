import Hero from '@/components/home/Hero';

/**
 * 首页。版式与动效全部在 components/home/ 里，这里只做组装 ——
 * 页面本身是 Server Component（文案来自 lib/data/content.ts，构建期就能渲染出完整 HTML）。
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
    </main>
  );
}