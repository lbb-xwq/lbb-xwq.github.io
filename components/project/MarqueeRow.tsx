'use client';

import Marquee from '@/components/ui/Marquee';
import ProjectArt from '@/components/projects/ProjectArt';
import type { Project } from '@/lib/data/content';

export type MarqueeRowProps = {
  project: Project;
  /** 变体后缀：让相邻两条跑马灯不会拿同一批种子（画面不同） */
  variant: string;
  direction?: 'left' | 'right';
  /** 小格数量（3–5 个不同 seed） */
  count?: number;
};

/**
 * 横向跑马灯。内容不是文案而是 3–5 张程序化小格（aspect 16:9、宽约 32vw），
 * 用 Marquee 的无缝循环（复制一份内容、位移 -50% 后回跳）。
 *
 * 整条 aria-hidden：这些是纯装饰画面，没有信息量；
 * 同时避免 Marquee 复制出来的第二份被读屏重复朗读。
 */
export default function MarqueeRow({ project, variant, direction = 'left', count = 4 }: MarqueeRowProps) {
  const seeds = Array.from({ length: count }, (_, i) => `${project.slug}-m${variant}${i}`);

  return (
    <div
      aria-hidden
      className="my-12 lg:my-32"
      style={{
        borderTop: '1px solid rgb(var(--c-line))',
        borderBottom: '1px solid rgb(var(--c-line))',
        padding: '1rem 0',
      }}
    >
      <Marquee speed={70} direction={direction} pauseOnHover>
        {seeds.map((seed) => (
          <div
            key={seed}
            style={{
              width: '32vw',
              minWidth: 200,
              aspectRatio: '16 / 9',
              marginRight: '1rem',
              overflow: 'hidden',
              backgroundColor: '#000',
              border: '1px solid rgb(var(--c-line-2))',
              borderRadius: 'var(--radius-panel)',
            }}
          >
            <ProjectArt seed={seed} palette={project.palette} />
          </div>
        ))}
      </Marquee>
    </div>
  );
}