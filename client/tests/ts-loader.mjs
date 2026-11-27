import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const clientRoot = path.resolve(import.meta.dirname, '..');

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;

  if (target.startsWith('@/')) {
    const sub = target.slice(2);
    const candidateTs = path.join(clientRoot, 'src', `${sub}.ts`);
    const candidateTsx = path.join(clientRoot, 'src', `${sub}.tsx`);
    if (fs.existsSync(candidateTs)) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
    if (fs.existsSync(candidateTsx)) {
      return nextResolve(pathToFileURL(candidateTsx).href, context);
    }
  }

  if ((target.startsWith('./') || target.startsWith('../')) && !path.extname(target) && context.parentURL) {
    const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const candidateTs = path.resolve(parentDir, `${target}.ts`);
    if (fs.existsSync(candidateTs)) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
  }

  return nextResolve(specifier, context);
}
