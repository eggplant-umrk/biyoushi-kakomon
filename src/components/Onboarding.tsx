import { useEffect, useRef } from 'react';
import { updateSettings } from '../lib/settings';
import { Icon, type IconName } from './Icon';

const POINTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'play',
    title: 'ホームから1タップで解ける',
    text: '「続きから」「今日やること」「弱点」を押すと、すぐ1問目が出ます。',
  },
  {
    icon: 'forward',
    title: '左右にスワイプで前後の問題へ',
    text: '解答するとすぐ正誤と解説が出ます。下のボタンでも移れます。',
  },
  {
    icon: 'star',
    title: '★で要復習に。メモも書ける',
    text: '気になる問題に★（要復習）を付けると、ホームや「解く」でまとめて解き直せます。自分用のメモも残せます。',
  },
];

/** 初回だけ出す1画面の説明（スキップできる）。見たかどうかは端末に覚える */
export function Onboarding() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const done = () => updateSettings({ onboarded: true });
  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <button type="button" className="onboarding-skip link-btn" onClick={done}>
          スキップ
        </button>
        <h1 id="onboarding-title" className="onboarding-title" ref={heading} tabIndex={-1}>
          美容師国家試験の過去問を、
          <br />
          すきま時間に1問ずつ。
        </h1>
        <ul className="onboarding-points">
          {POINTS.map((p) => (
            <li key={p.title}>
              <span className="onboarding-icon">
                <Icon name={p.icon} />
              </span>
              <span>
                <strong>{p.title}</strong>
                <span className="small muted">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary" onClick={done}>
          はじめる
        </button>
      </div>
    </div>
  );
}
