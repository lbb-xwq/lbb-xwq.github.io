import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ProjectDetail from '@/components/project/ProjectDetail';
import { person, projects } from '@/lib/data/content';

/** Next 15：动态段的 params 是 Promise，页面与 generateMetadata 里都要 await */
type ProjectPageProps = {
  params: Promise<{ slug: string }>;
};

/** 6 个 slug 全部在构建期生成（内容来自 content.ts，无需运行时请求） */
export function generateStaticParams(): { slug: string }[] {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) return { title: `Projects — ${person.name}` };
  return {
    title: `${project.name} — ${person.name}`,
    description: project.description,
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const index = projects.findIndex((p) => p.slug === slug);
  // 未知 slug：走 404（notFound() 返回 never，下面的索引访问因此是安全的）
  if (index < 0) notFound();

  const project = projects[index];
  // 最后一项回卷到第一项：详情页永远有"下一个项目"可去
  const next = projects[(index + 1) % projects.length];

  return (
    <main style={{ position: 'relative', minHeight: '100svh' }}>
      <ProjectDetail project={project} next={next} />
    </main>
  );
}