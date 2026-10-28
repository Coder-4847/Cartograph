import { App } from './app.ts';
import { Landing } from './landing/landing.ts';

/** Loaded after first paint: builds the 3D world, then hands over to the landing page. */
const app = new App(document.getElementById('stage') as HTMLCanvasElement);
const landing = new Landing(app);
landing.init();
(window as unknown as { __app: App }).__app = app;
