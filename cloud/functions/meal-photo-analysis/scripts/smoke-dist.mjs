import { Buffer } from 'node:buffer';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

Object.assign(process.env, {
  CLOUDBASE_ENV_ID: 'smoke',
  CLOUDBASE_PUBLISHABLE_KEY: 'publishable-key',
  PHOTO_MEAL_MODEL_PROVIDER: 'http-json',
  PHOTO_MEAL_MODEL_ENDPOINT: 'https://model.example.invalid/v1/chat/completions',
  PHOTO_MEAL_MODEL_API_KEY: 'smoke-placeholder',
  PHOTO_MEAL_MODEL_NAME: 'vision-food-v1',
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function collectTextFiles(root) {
  const entries = await readdir(root);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = new URL(`${entry}`, root);
    const stats = await stat(path);
    if (stats.isDirectory()) return collectTextFiles(new URL(`${entry}/`, root));
    return ['.js', '.json', '.map', '.txt'].includes(extname(path.pathname)) ? [path] : [];
  }));
  return files.flat();
}

async function assertDistHasNoForbiddenMarkers(distRoot) {
  const forbiddenDistMarkers = [
    /@cloudbase\/js-sdk/,
    /\bwindow\b/,
    /\bdocument\b/,
    /__daily-record-test-platform/,
    /246810/,
    /server-only-/,
    /model\.example\.invalid/,
    /TENCENTCLOUD_SECRET/i,
    /CLOUDBASE_APIKEY/i,
    /OPENAI_API_KEY/i,
    /DASHSCOPE_API_KEY/i,
  ];
  const offenders = [];
  for (const file of await collectTextFiles(distRoot)) {
    const content = await readFile(file, 'utf8');
    for (const marker of forbiddenDistMarkers) {
      if (marker.test(content)) {
        offenders.push(`${file.pathname}: ${marker}`);
      }
    }
  }
  assert(offenders.length === 0, `mealPhotoAnalysis dist contains forbidden markers: ${offenders.join(', ')}`);
}

async function assertDistHasNoSourceMaps(distRoot) {
  const sourceMaps = (await collectTextFiles(distRoot))
    .filter((file) => extname(file.pathname) === '.map')
    .map((file) => file.pathname);
  assert(sourceMaps.length === 0, `mealPhotoAnalysis dist must not include source maps: ${sourceMaps.join(', ')}`);
}

const distRoot = new URL('../dist/', import.meta.url);
await assertDistHasNoForbiddenMarkers(distRoot);
await assertDistHasNoSourceMaps(distRoot);

const pkg = JSON.parse(await readFile(new URL('../dist/package.json', import.meta.url), 'utf8'));
assert(pkg.type === 'module' && pkg.main === 'index.js', 'mealPhotoAnalysis dist package metadata is invalid');
assert(
  pkg.dependencies?.['@cloudbase/node-sdk'] === '3.18.3',
  'mealPhotoAnalysis dist package CloudBase Node SDK dependency is invalid',
);

const mod = await import('../dist/index.js');
assert(typeof mod.main === 'function' && typeof mod.default === 'function', 'mealPhotoAnalysis dist entrypoint is invalid');
assert(
  typeof mod.createCloudBaseObjectStorageUploadClient === 'function',
  'mealPhotoAnalysis dist storage adapter export is invalid',
);

const uploadCalls = [];
const storage = mod.createCloudBaseObjectStorageUploadClient({
  async uploadFile(input) {
    uploadCalls.push(input);
    return { fileID: 'cloud://smoke/users/hash/photo-meal/request/photo.webp' };
  },
});

await storage.uploadFile({
  cloudPath: 'users/hash/photo-meal/request/photo.webp',
  fileContent: Buffer.from('ABCD'),
  contentType: 'image/webp',
});

assert(uploadCalls.length === 1, 'mealPhotoAnalysis dist storage adapter did not call uploadFile once');
assert(uploadCalls[0].cloudPath === 'users/hash/photo-meal/request/photo.webp', 'mealPhotoAnalysis dist storage cloudPath is invalid');
assert(Buffer.isBuffer(uploadCalls[0].fileContent), 'mealPhotoAnalysis dist storage fileContent is invalid');
assert(!Object.hasOwn(uploadCalls[0], 'contentType'), 'mealPhotoAnalysis dist storage adapter leaked contentType');

try {
  await mod.main({ action: 'get', payload: { analysisId: 'smoke-analysis' } });
  throw new Error('mealPhotoAnalysis dist main smoke unexpectedly succeeded');
} catch (error) {
  if (error?.code !== 'unauthenticated') throw error;
}
