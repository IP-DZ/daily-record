import {
  preparedMealPhotoSchema,
  type PreparedMealPhoto,
} from '@daily-record/contracts';

type PreparedMealPhotoMimeType = PreparedMealPhoto['mimeType'];

export type PrepareMealPhotoErrorCode =
  | 'unsupported-file-type'
  | 'read-failed'
  | 'decode-failed'
  | 'render-failed'
  | 'output-too-large'
  | 'invalid-output';

export class PrepareMealPhotoError extends Error {
  constructor(
    public readonly code: PrepareMealPhotoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PrepareMealPhotoError';
  }
}

export interface DecodedMealPhotoImage {
  width: number;
  height: number;
  source: unknown;
}

export interface RenderMealPhotoInput {
  source: unknown;
  sourceDataUrl: string;
  targetWidth: number;
  targetHeight: number;
  mimeType: PreparedMealPhotoMimeType;
  quality: number;
}

export interface RenderedMealPhoto {
  dataUrl: string;
  sizeBytes?: number;
}

export interface MealPhotoImageAdapter {
  decode(dataUrl: string): Promise<DecodedMealPhotoImage>;
  render(input: RenderMealPhotoInput): Promise<RenderedMealPhoto>;
}

export interface PrepareMealPhotoOptions {
  maxLongEdgePx?: number;
  maxOutputBytes?: number;
  preferredMimeType?: PreparedMealPhotoMimeType;
  quality?: number;
  readAsDataUrl?: (file: File) => Promise<string>;
  imageAdapter?: MealPhotoImageAdapter;
}

const supportedInputTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function safeOriginalName(name: string): string {
  const normalized = name.replaceAll('\\', '/').split('/').pop()?.trim() ?? '';
  return (normalized || 'meal-photo').slice(0, 120);
}

function calculateTargetSize(width: number, height: number, maxLongEdgePx: number): {
  targetWidth: number;
  targetHeight: number;
} {
  const longEdge = Math.max(width, height);
  const scale = longEdge > maxLongEdgePx ? maxLongEdgePx / longEdge : 1;
  return {
    targetWidth: Math.max(1, Math.round(width * scale)),
    targetHeight: Math.max(1, Math.round(height * scale)),
  };
}

function estimateDataUrlSizeBytes(dataUrl: string): number {
  const encoded = dataUrl.split(',')[1] ?? '';
  const withoutWhitespace = encoded.replaceAll(/\s/g, '');
  const padding = withoutWhitespace.endsWith('==') ? 2 : withoutWhitespace.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((withoutWhitespace.length * 3) / 4) - padding);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new PrepareMealPhotoError('read-failed', '读取图片失败，请重新选择图片。'));
    });
    reader.addEventListener('error', () => {
      reject(new PrepareMealPhotoError('read-failed', '读取图片失败，请重新选择图片。'));
    });
    reader.readAsDataURL(file);
  });
}

const browserImageAdapter: MealPhotoImageAdapter = {
  decode(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          source: image,
        });
      });
      image.addEventListener('error', () => {
        reject(new PrepareMealPhotoError('decode-failed', '解析图片失败，请换一张图片。'));
      });
      image.src = dataUrl;
    });
  },
  async render(input) {
    const canvas = document.createElement('canvas');
    canvas.width = input.targetWidth;
    canvas.height = input.targetHeight;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new PrepareMealPhotoError('render-failed', '压缩图片失败，请重新选择图片。');
    }
    context.drawImage(input.source as CanvasImageSource, 0, 0, input.targetWidth, input.targetHeight);
    return {
      dataUrl: canvas.toDataURL(input.mimeType, input.quality),
    };
  },
};

export async function prepareMealPhoto(
  file: File,
  options: PrepareMealPhotoOptions = {},
): Promise<PreparedMealPhoto> {
  const maxLongEdgePx = options.maxLongEdgePx ?? 1600;
  const maxOutputBytes = options.maxOutputBytes ?? 1_500_000;
  const preferredMimeType = options.preferredMimeType ?? 'image/webp';
  const quality = options.quality ?? 0.82;
  const adapter = options.imageAdapter ?? browserImageAdapter;
  const readAsDataUrl = options.readAsDataUrl ?? readFileAsDataUrl;

  if (!supportedInputTypes.has(file.type)) {
    throw new PrepareMealPhotoError('unsupported-file-type', '请选择 JPEG、PNG 或 WebP 图片。');
  }

  let sourceDataUrl: string;
  try {
    sourceDataUrl = await readAsDataUrl(file);
  } catch (error) {
    if (error instanceof PrepareMealPhotoError) {
      throw error;
    }
    throw new PrepareMealPhotoError('read-failed', '读取图片失败，请重新选择图片。');
  }

  let decoded: DecodedMealPhotoImage;
  try {
    decoded = await adapter.decode(sourceDataUrl);
  } catch (error) {
    if (error instanceof PrepareMealPhotoError) {
      throw error;
    }
    throw new PrepareMealPhotoError('decode-failed', '解析图片失败，请换一张图片。');
  }

  const { targetWidth, targetHeight } = calculateTargetSize(
    decoded.width,
    decoded.height,
    maxLongEdgePx,
  );

  let rendered: RenderedMealPhoto;
  try {
    rendered = await adapter.render({
      source: decoded.source,
      sourceDataUrl,
      targetWidth,
      targetHeight,
      mimeType: preferredMimeType,
      quality,
    });
  } catch (error) {
    if (error instanceof PrepareMealPhotoError) {
      throw error;
    }
    throw new PrepareMealPhotoError('render-failed', '压缩图片失败，请重新选择图片。');
  }

  const sizeBytes = rendered.sizeBytes ?? estimateDataUrlSizeBytes(rendered.dataUrl);
  if (sizeBytes > maxOutputBytes) {
    throw new PrepareMealPhotoError('output-too-large', '图片压缩后仍超过大小限制，请换一张更小的图片。');
  }

  const parsed = preparedMealPhotoSchema.safeParse({
    dataUrl: rendered.dataUrl,
    mimeType: preferredMimeType,
    sizeBytes,
    width: targetWidth,
    height: targetHeight,
    originalName: safeOriginalName(file.name),
  });
  if (!parsed.success) {
    throw new PrepareMealPhotoError('invalid-output', '图片压缩结果无效，请重新选择图片。');
  }

  return parsed.data;
}
