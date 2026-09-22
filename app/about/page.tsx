import type { Metadata } from 'next';

import AboutClient from '@/components/about/AboutClient';
import { about, meta } from '@/lib/data/content';

export const metadata: Metadata = {
  title: `${about.title} — ${meta.siteName}`,
  description: about.lede,
};

/**
 * 关于页的服务器外壳：只负责 metadata，交互与动效都在 AboutClient 里（'use client'）。
 */
export default function AboutPage() {
  return <AboutClient />;
}