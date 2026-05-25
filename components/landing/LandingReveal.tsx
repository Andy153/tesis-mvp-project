'use client';

import type { ReactNode } from 'react';
import { useReveal } from './hooks/useReveal';
import styles from './landing.module.css';

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section';
};

export function LandingReveal({ children, className, delay = 0, as = 'div' }: Props) {
  const { ref, visible } = useReveal<HTMLDivElement>({ threshold: 0.1 });
  const Tag = as;

  return (
    <Tag
      ref={ref}
      className={[styles.reveal, visible ? styles.revealVisible : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
