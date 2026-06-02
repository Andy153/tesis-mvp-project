'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LandingAppPreview } from './LandingAppPreview';
import styles from './landing.module.css';

const ROTATING_LINES = [
  'El sistema administrativo es el que falla.',
  'Los plazos vencen sin que nadie te avise.',
  'Cobrar no puede seguir siendo un "parto".',
] as const;

const ROTATE_MS = 4200;

export function LandingHero() {
  const [lineIndex, setLineIndex] = useState(0);
  const [lineVisible, setLineVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true);
      setLineVisible(true);
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => {
      setLineVisible(false);
      window.setTimeout(() => {
        setLineIndex((i) => (i + 1) % ROTATING_LINES.length);
        setLineVisible(true);
      }, 400);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [mounted]);

  return (
    <div className={styles.heroWrap}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={[styles.heroEyebrow, mounted ? styles.heroIn : ''].join(' ')}>
            Del parte al cobro · Swiss Medical y OSDE
          </span>
          <h1 className={styles.heroTitleBlock}>
            <span className={[styles.heroLineLead, mounted ? styles.heroIn : ''].join(' ')}>
              Operaste.
            </span>
            <span className={styles.heroLineReveal} aria-live="polite">
              <span
                className={[
                  styles.heroLineRevealInner,
                  lineVisible ? styles.heroLineShow : styles.heroLineHide,
                ].join(' ')}
              >
                {ROTATING_LINES[lineIndex]}
              </span>
            </span>
          </h1>
          <p className={[styles.heroSubtitle, mounted ? styles.heroInDelay : ''].join(' ')}>
            Subís el parte quirúrgico y la autorización. Trazá extrae los datos, valida contra la
            prepaga y te da visibilidad del cobro — sin depender de planillas a mano.
          </p>
          <div className={[styles.heroCta, mounted ? styles.heroInDelay2 : ''].join(' ')}>
            <Link href="/sign-in" className="btn btn-primary">
              Probar plataforma
            </Link>
            <span className={styles.heroSecondary}>Sin tarjeta · acceso limitado MVP</span>
          </div>
          <div className={[styles.prepagas, mounted ? styles.heroInDelay3 : ''].join(' ')}>
            <p className={styles.prepagasLabel}>Prepagas que conocemos por dentro</p>
            <div className={styles.prepagasLogos}>
              <Image
                src="/logos/swiss-medical.png"
                alt="Swiss Medical"
                width={136}
                height={34}
                className={styles.prepagaLogo}
              />
              <Image
                src="/logos/osde.png"
                alt="OSDE"
                width={82}
                height={34}
                className={styles.prepagaLogo}
              />
            </div>
          </div>
        </div>

        <div className={[styles.heroPreview, mounted ? styles.heroPreviewIn : ''].join(' ')}>
          <LandingAppPreview />
        </div>
      </header>
    </div>
  );
}
