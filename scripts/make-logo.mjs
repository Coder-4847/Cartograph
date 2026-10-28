// Writes public/favicon.svg from the same geometry the page animates (src/landing/logo.ts).
import { writeFile } from 'node:fs/promises';
import { logoMarkup } from '../src/landing/logo.ts';

await writeFile(new URL('../public/favicon.svg', import.meta.url), logoMarkup({ size: 64, tile: true }) + '\n');
console.log('public/favicon.svg written');
