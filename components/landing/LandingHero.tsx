import Image from 'next/image';
import Link from 'next/link';
import { LandingAppPreview } from './LandingAppPreview';
import styles from './landing.module.css';

export function LandingHero() {
  return (
    <div className={styles.heroWrap}>
      <div className={styles.heroGlow} aria-hidden />
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>Del parte al cobro · Swiss Medical y OSDE</span>
          <h1 className={styles.heroTitle}>Operaste. El sistema administrativo es el que falla.</h1>
          <p className={styles.heroSubtitle}>
            Subís el parte quirúrgico y la autorización. Trazá extrae los datos, valida contra la prepaga
            y te da visibilidad del cobro — sin depender de planillas a mano.
          </p>
          <div className={styles.heroCta}>
            <Link href="/sign-in" className="btn btn-primary">
              Probar plataforma
            </Link>
            <span className={styles.heroSecondary}>Sin tarjeta · acceso limitado MVP</span>
          </div>
          <div className={styles.prepagas}>
            <p className={styles.prepagasLabel}>Prepagas que conocemos por dentro</p>
            <div className={styles.prepagasLogos}>
              <Image
                src="/logos/swiss-medical.png"
                alt="Swiss Medical"
                width={120}
                height={28}
                className={styles.prepagaLogo}
              />
              <Image
                src="/logos/osde.png"
                alt="OSDE"
                width={72}
                height={28}
                className={styles.prepagaLogo}
              />
            </div>
          </div>
        </div>

        <div className={styles.heroPreview}>
          <LandingAppPreview />
        </div>
      </header>
    </div>
  );
}
