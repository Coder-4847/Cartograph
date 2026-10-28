function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Without WebGL the landing page still works as a static page; submitting explains why. */
function degrade(): void {
  document.body.classList.add('no-webgl');
  const msg = 'This browser can’t run WebGL, which Cartograph needs to draw the city. Try a recent Chrome, Firefox, Safari or Edge.';
  document.querySelectorAll<HTMLFormElement>('[data-repo-form]').forEach((form) => {
    const err = form.nextElementSibling as HTMLElement | null;
    const show = () => err && ((err.textContent = msg), (err.hidden = false));
    form.addEventListener('submit', (e) => (e.preventDefault(), show()));
    form.querySelector('[data-demo]')?.addEventListener('click', show);
  });
}

/** Loaded after first paint: builds the 3D world, then hands over to the landing page. */
if (hasWebGL()) {
  // three.js and the app only download when the browser can actually use them
  const [{ App }, { Landing }] = await Promise.all([import('./app.ts'), import('./landing/landing.ts')]);
  const app = new App(document.getElementById('stage') as HTMLCanvasElement);
  new Landing(app).init();
  (window as unknown as { __app: InstanceType<typeof App> }).__app = app;
} else {
  degrade();
}

export {};
