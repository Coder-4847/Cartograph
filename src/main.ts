import './styles.css';
import { App } from './app.ts';

const app = new App(document.getElementById('stage') as HTMLCanvasElement);
(window as unknown as { __app: App }).__app = app;

const form = document.getElementById('repo-form') as HTMLFormElement;
const input = document.getElementById('repo-input') as HTMLInputElement;
form.addEventListener('submit', (e) => {
  e.preventDefault();
  void app.open(input.value);
});
document.getElementById('demo-btn')!.addEventListener('click', () => void app.openDemo());
void app.openDemo();
