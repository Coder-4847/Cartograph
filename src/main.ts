import './styles.css';
import './landing/landing.css';
import { gsap, reducedMotion } from './motion.ts';
import { logoMarkup } from './landing/logo.ts';

// The landing copy is static HTML, so it paints immediately. Only the logo needs JS up front.
const mark = document.getElementById('brand-mark');
if (mark) {
  mark.innerHTML = logoMarkup({ size: 30, animate: !reducedMotion() });
  if (!reducedMotion()) {
    const faces = mark.querySelectorAll('.lf');
    gsap
      .timeline({ delay: 0.15 })
      .to(faces, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut', stagger: { each: 0.03 } })
      .to(faces, { fillOpacity: 1, duration: 0.5, ease: 'power1.out', stagger: { each: 0.02 } }, '-=0.55');
  }
}

// Boot the 3D scene after the first frames so text and fonts win the LCP race.
requestAnimationFrame(() => requestAnimationFrame(() => void import('./boot.ts')));
