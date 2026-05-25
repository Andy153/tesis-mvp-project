'use client';

import { useEffect } from 'react';
import { LandingCta } from './LandingCta';
import { LandingFeatures } from './LandingFeatures';
import { LandingHero } from './LandingHero';
import { LandingHowItWorks } from './LandingHowItWorks';
import { LandingNav } from './LandingNav';
import { LandingProblem } from './LandingProblem';
import styles from './landing.module.css';

export function LandingPage() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    const prevHtmlOverflow = document.documentElement.style.overflowX;
    const prevBodyOverflow = document.body.style.overflowX;
    document.documentElement.style.overflowX = 'clip';
    document.body.style.overflowX = 'clip';
    return () => {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.overflowX = prevHtmlOverflow;
      document.body.style.overflowX = prevBodyOverflow;
    };
  }, []);

  return (
    <div className={styles.page}>
      <LandingNav />
      <div className={styles.inner}>
        <LandingHero />
      </div>
      <LandingProblem />
      <div className={styles.inner}>
        <LandingHowItWorks />
        <LandingFeatures />
        <LandingCta />
        <footer className={styles.footer}>
          © {new Date().getFullYear()} Trazá · MVP en desarrollo · Acceso limitado
        </footer>
      </div>
    </div>
  );
}
