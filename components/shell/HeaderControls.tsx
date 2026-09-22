'use client';

import { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';

import { playUiSound, startAudio, stopAudio } from '@/lib/audio';
import { person } from '@/lib/data/content';
import { sel, useStore } from '@/lib/store';

/**
 * 站点控件（右下角簇 + 右缘齿轮），文案全中文。
 * 数值来自参考站实测（1440×900 视口 → 实际视口 1424×805）：
 *   控件簇 [992,715,392,58] mix-blend-mode: difference（右 40 / 下 32）
 *   声音键 [992,718,56,55]（底边贴簇底边 → 簇用 items-end）
 *   导航胶囊 [1064,715,320,58] rgba(255,255,255,0.05) + blur(15px) + 1px rgba(85,85,85,0.3)
 *   白图标块 [1335,724,40,40] 胶囊内右侧、内缩 9px
 *   齿轮 [1384,379,40,40] 贴右缘、比视口正中心高 4px
 */
export default function HeaderControls() {
  const headerRef = useRef<HTMLElement>(null);
  const entered = useStore((s) => s.entered);
  const motion = useStore(sel.motion);
  const menuOpen = useStore(sel.menuOpen);
  const settingsOpen = useStore(sel.settingsOpen);
  const audioOn = useStore(sel.audioOn);


  // 进入后淡入 header（实测参考站：opacity 0→1 / 0.6s / cubic-bezier(0.16,1,0.3,1)）
  useEffect(() => {
    if (!entered || !headerRef.current) return;
    if (motion === 'reduced') {
      headerRef.current.style.opacity = '1';
      return;
    }
    gsap.to(headerRef.current, { opacity: 1, duration: 0.6, ease: 'expo.out' });
  }, [entered, motion]);
  const toggleMenu = useCallback(() => {
    const next = !useStore.getState().menuOpen;
    useStore.getState().setMenu(next);
    playUiSound(next ? 'pop' : 'click');
  }, []);

  const toggleSound = useCallback(() => {
    const state = useStore.getState();
    if (!state.audioOn) {
      startAudio(state.track);
      state.setAudio(true);
      playUiSound('pop');
    } else {
      playUiSound('click');
      state.setAudio(false);
      stopAudio();
    }
  }, []);

  const toggleSettings = useCallback(() => {
    const next = !useStore.getState().settingsOpen;
    useStore.getState().setSettings(next);
    playUiSound(next ? 'pop' : 'click');
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className="fixed bottom-8 right-10 flex items-end gap-4"
        style={{ zIndex: 'var(--z-hud)', mixBlendMode: 'difference', opacity: 0 }}
      >
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={audioOn}
          aria-label={audioOn ? '关闭声音引擎' : '打开声音引擎'}
          className="flex h-[55px] w-[56px] items-center justify-center transition-opacity duration-500"
          style={{ opacity: audioOn ? 1 : 0.5 }}
        >
          <svg width="40" height="48" viewBox="0 0 40 48" fill="none" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const amp = audioOn ? 18 - i * 2 : 6 + (i % 3) * 3;
              return (
                <line
                  key={i}
                  x1={4 + i * 6}
                  y1={24 - amp}
                  x2={4 + i * 6}
                  y2={24 + amp}
                  stroke="rgb(255 255 255)"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleMenu}
          aria-expanded={menuOpen}
          aria-controls="nav-overlay"
          aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
          className="flex h-[58px] w-[320px] items-center justify-between"
          style={{
            paddingLeft: 25,
            paddingRight: 9,
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(15px)',
            WebkitBackdropFilter: 'blur(15px)',
            border: '1px solid rgba(85,85,85,0.3)',
            borderRadius: 12,
          }}
        >
          <span
            className="hud"
            style={{ color: menuOpen ? 'rgb(255 255 255 / 0.9)' : 'rgb(255 255 255 / 0.5)' }}
          >
            {menuOpen ? '关闭' : '菜单'}
          </span>
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center"
            style={{ background: 'rgb(255 255 255)', borderRadius: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              {menuOpen ? (
                <path d="M3 3l10 10M13 3L3 13" stroke="#000" strokeWidth="1.4" />
              ) : (
                <path d="M2 5h12M2 11h8" stroke="#000" strokeWidth="1.4" />
              )}
            </svg>
          </span>
        </button>
      </header>

      <button
        type="button"
        onClick={toggleSettings}
        aria-expanded={settingsOpen}
        aria-controls="settings-panel"
        aria-label={settingsOpen ? '关闭系统设置面板' : '打开系统设置面板'}
        className="fixed right-0 flex h-10 w-10 -translate-y-1/2 items-center justify-center"
        style={{ zIndex: 'var(--z-hud)', mixBlendMode: 'difference', top: 'calc(50% - 4px)' }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          style={{
            transform: `rotate(${settingsOpen ? 45 : 0}deg)`,
            transition: 'transform .6s cubic-bezier(.16,1,.3,1)',
          }}
        >
          <circle cx="10" cy="10" r="3" stroke="rgb(255 255 255 / 0.8)" strokeWidth="1.4" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={10 + Math.cos(a) * 4.6}
                y1={10 + Math.sin(a) * 4.6}
                x2={10 + Math.cos(a) * 7.4}
                y2={10 + Math.sin(a) * 7.4}
                stroke="rgb(255 255 255 / 0.8)"
                strokeWidth="1.4"
              />
            );
          })}
        </svg>
      </button>

      <span className="sr-only">{`${person.name} — ${person.role}`}</span>
    </>
  );
}