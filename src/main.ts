import './styles.css';
import { loadRepo, loadSample, parseRepo } from './api/index.ts';
import { City } from './city/city.ts';
import { World } from './city/world.ts';
import { Loader } from './ui/loader.ts';
import type { RepoData } from './types.ts';
import { FetchError } from './types.ts';

const world = new World(document.getElementById('stage') as HTMLCanvasElement);
const city = new City(world);
const loader = new Loader(document.body);
world.start();

function show(data: RepoData) {
  city.setData(data);
  loader.hide();
}

async function visualize(input: string) {
  loader.show('Resolving repository…');
  try {
    const ref = parseRepo(input);
    show(await loadRepo(ref, { onProgress: (p) => loader.update(p) }));
  } catch (e) {
    loader.hide();
    alert(e instanceof FetchError ? e.message : 'Something went wrong. Please try again.');
  }
}

const form = document.getElementById('repo-form') as HTMLFormElement;
const input = document.getElementById('repo-input') as HTMLInputElement;
form.addEventListener('submit', (e) => {
  e.preventDefault();
  void visualize(input.value);
});
document.getElementById('demo-btn')!.addEventListener('click', async () => show(await loadSample()));
void loadSample().then(show);
