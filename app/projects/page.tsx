import type { Metadata } from 'next';

import NoiseGridBackground from '@/components/canvas/NoiseGridBackground';
import ProjectWall from '@/components/projects/ProjectWall';
import { meta, person, projects } from '@/lib/data/content';

export const metadata: Metadata = {
  title: `负责项目 — ${person.name}`,
  description: meta.description,
};

/**
 * 项目页：单屏的滚轮驱动项目墙。
 *
 * 页面本身不滚动（height:100svh + overflow:hidden），位移全部发生在卡墙内部 ——
 * 所以这里没有自建滚动容器，ScrollTrigger 也不需要参与（详情页才用）。
 * 文案全部来自 content.ts，页面只负责把 projects 递给卡墙。
 */
export default function ProjectsPage() {
  return (
    <main
      style={{
        position: 'relative',
        height: '100svh',
        overflow: 'hidden',
        backgroundColor: 'rgb(var(--c-bg))',
      }}
    >
      <NoiseGridBackground />
      <ProjectWall projects={projects} />
    </main>
  );
}