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
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  return (
    <div className={styles.page}>
      <LandingNav />
      <div className={styles.inner}>
        <LandingHero />
        <LandingProblem />
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
