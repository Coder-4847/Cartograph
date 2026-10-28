import gsap from 'gsap';

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

export const reducedMotion = () => mq.matches;

/** Duration helper: collapses to ~0 when the user prefers reduced motion. */
export const dur = (seconds: number) => (mq.matches ? 0.001 : seconds);

export { gsap };
