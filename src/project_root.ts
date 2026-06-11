import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path to the package root. This module sits at the top of `src`
 * (and of the built `dist`), so a single `..` hop reaches the package root
 * whether running via tsx from `src` or from the compiled `dist` output.
 */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
