import { describe, expect, it } from 'vitest';

import {
  PrepareMealPhotoError,
  prepareMealPhoto,
  type MealPhotoImageAdapter,
  type RenderMealPhotoInput,
} from './prepareMealPhoto';

function file(name: string, type: string): File {
  return new File(['fake-image-bytes'], name, { type });
}

function dataUrl(type: string): string {
  return `data:${type};base64,AAAA`;
}

function createAdapter(options: {
  width: number;
  height: number;
  sizeBytes?: number;
  renderedDataUrl?: string;
}): MealPhotoImageAdapter & { renders: RenderMealPhotoInput[] } {
  const renders: RenderMealPhotoInput[] = [];
  return {
    renders,
    decode: async () => ({
      width: options.width,
      height: options.height,
      source: { kind: 'fake-image' },
    }),
    render: async (input) => {
      renders.push(input);
      return {
        dataUrl: options.renderedDataUrl ?? dataUrl(input.mimeType),
        sizeBytes: options.sizeBytes ?? 120_000,
      };
    },
  };
}

describe('prepareMealPhoto', () => {
  it('compresses a landscape JPEG to the maximum long edge as WebP', async () => {
    const adapter = createAdapter({ width: 2400, height: 1200 });

    await expect(prepareMealPhoto(file('lunch.jpg', 'image/jpeg'), {
      imageAdapter: adapter,
      readAsDataUrl: async () => dataUrl('image/jpeg'),
    })).resolves.toEqual({
      dataUrl: 'data:image/webp;base64,AAAA',
      mimeType: 'image/webp',
      sizeBytes: 120_000,
      width: 1600,
      height: 800,
      originalName: 'lunch.jpg',
    });
    expect(adapter.renders).toHaveLength(1);
    expect(adapter.renders[0]).toMatchObject({
      targetWidth: 1600,
      targetHeight: 800,
      mimeType: 'image/webp',
    });
  });

  it('compresses a portrait PNG without leaking path separators in the output name', async () => {
    const adapter = createAdapter({ width: 900, height: 2400 });

    await expect(prepareMealPhoto(file('private/path/dinner.png', 'image/png'), {
      imageAdapter: adapter,
      readAsDataUrl: async () => dataUrl('image/png'),
    })).resolves.toMatchObject({
      width: 600,
      height: 1600,
      originalName: 'dinner.png',
    });
  });

  it('does not upscale a small image and can render JPEG when requested', async () => {
    const adapter = createAdapter({ width: 800, height: 600 });

    await expect(prepareMealPhoto(file('snack.webp', 'image/webp'), {
      imageAdapter: adapter,
      preferredMimeType: 'image/jpeg',
      readAsDataUrl: async () => dataUrl('image/webp'),
    })).resolves.toMatchObject({
      dataUrl: 'data:image/jpeg;base64,AAAA',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
    });
  });

  it('rejects non-image files before decoding', async () => {
    const adapter = createAdapter({ width: 800, height: 600 });

    await expect(prepareMealPhoto(file('notes.txt', 'text/plain'), {
      imageAdapter: adapter,
      readAsDataUrl: async () => 'not-used',
    })).rejects.toMatchObject({
      code: 'unsupported-file-type',
    });
    expect(adapter.renders).toHaveLength(0);
  });

  it('rejects compressed output larger than the configured limit with a safe error', async () => {
    const adapter = createAdapter({ width: 2400, height: 1200, sizeBytes: 1_500_001 });

    await expect(prepareMealPhoto(file('secret/lunch.jpg', 'image/jpeg'), {
      imageAdapter: adapter,
      readAsDataUrl: async () => dataUrl('image/jpeg'),
    })).rejects.toSatisfy((error: unknown) => (
      error instanceof PrepareMealPhotoError
      && error.code === 'output-too-large'
      && !error.message.includes('secret')
      && !error.message.includes('data:image')
    ));
  });

  it('rejects adapter output that is not a safe prepared meal photo', async () => {
    const adapter = createAdapter({
      width: 1200,
      height: 900,
      renderedDataUrl: 'data:text/plain;base64,AAAA',
    });

    await expect(prepareMealPhoto(file('lunch.jpg', 'image/jpeg'), {
      imageAdapter: adapter,
      readAsDataUrl: async () => dataUrl('image/jpeg'),
    })).rejects.toMatchObject({
      code: 'invalid-output',
    });
  });
});
