/**
 * Thin bridge to the globally loaded Matter.js build (see index.html).
 *
 * Keeping the global lookup in one place means every other module can simply
 * `import { Matter } from '../lib/matter.js'` like a normal ES module.
 */
export const Matter = globalThis.Matter;

if (!Matter) {
  throw new Error('Matter.js was not loaded. Check the <script> tag in index.html.');
}
