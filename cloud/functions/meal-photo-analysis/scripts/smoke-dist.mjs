import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
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
