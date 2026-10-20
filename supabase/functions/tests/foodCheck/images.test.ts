import { describe, expect, it, vi } from 'vitest';
import {
  type CodecImage,
  type ImageCodec,
  ORIGINAL_LONGEST_SIDE,
  prepareFoodCheckImages,
  THUMB_LONGEST_SIDE,
} from '../../food-check/images.ts';

// 가짜 이미지: resize는 제자리에서 크기를 바꾸고, encodeJPEG는 "q<품질>@<가로>x<세로>"를 돌려준다
const fakeCodec = (width: number, height: number) => {
  const encoded: string[] = [];
  const image: CodecImage = {
    width,
    height,
    resize: vi.fn((w: number, h: number) => {
      const ratio = image.width / image.height;
      if (w === -1) {
        image.width = Math.round(h * ratio);
        image.height = h;
      } else {
        image.width = w;
        image.height = Math.round(w / ratio);
      }
    }),
    encodeJPEG: vi.fn(async (quality: number) => {
      const tag = `q${quality}@${image.width}x${image.height}`;
      encoded.push(tag);
      return new TextEncoder().encode(tag);
    }),
  };
  const codec: ImageCodec = { decode: vi.fn(async () => image), RESIZE_AUTO: -1 };
  return { codec, image, encoded };
};

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('prepareFoodCheckImages', () => {
  it('JPEG는 원본 바이트를 그대로 쓰고 썸네일만 인코딩', async () => {
    const { codec, encoded } = fakeCodec(3000, 4000);
    const raw = [0xff, 0xd8, 0xff, 1, 2, 3];
    const out = await prepareFoodCheckImages(codec, {
      imageBase64: b64(raw),
      mimeType: 'image/jpeg',
    });
    expect(Array.from(out.original)).toEqual(raw);
    expect(encoded).toEqual([`q70@150x${THUMB_LONGEST_SIDE}`]);
    expect(text(out.thumb)).toBe('q70@150x200');
  });

  it('PNG는 긴 변 1280으로 줄여 JPEG로 다시 인코딩', async () => {
    const { codec, encoded } = fakeCodec(4000, 2000);
    const out = await prepareFoodCheckImages(codec, {
      imageBase64: b64([1, 2]),
      mimeType: 'image/png',
    });
    expect(text(out.original)).toBe(`q80@${ORIGINAL_LONGEST_SIDE}x640`);
    expect(text(out.thumb)).toBe('q70@200x100');
    expect(encoded).toHaveLength(2);
  });

  it('mimeType이 JPEG여도 바이트가 JPEG가 아니면 다시 인코딩', async () => {
    const { codec } = fakeCodec(2000, 1000);
    const out = await prepareFoodCheckImages(codec, {
      imageBase64: b64([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/jpeg',
    });
    expect(text(out.original)).toBe('q80@1280x640');
  });

  it('작은 이미지는 키우지 않음', async () => {
    const { codec, image } = fakeCodec(120, 80);
    const out = await prepareFoodCheckImages(codec, {
      imageBase64: b64([1]),
      mimeType: 'image/png',
    });
    expect(image.resize).not.toHaveBeenCalled();
    expect(text(out.original)).toBe('q80@120x80');
    expect(text(out.thumb)).toBe('q70@120x80');
  });

  it('디코드 실패는 그대로 던짐', async () => {
    const codec: ImageCodec = {
      decode: vi.fn(async () => {
        throw new Error('bad image');
      }),
      RESIZE_AUTO: -1,
    };
    await expect(
      prepareFoodCheckImages(codec, { imageBase64: b64([1]), mimeType: 'image/jpeg' })
    ).rejects.toThrow('bad image');
  });
});
