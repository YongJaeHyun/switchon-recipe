import { describe, expect, it } from 'vitest';
import {
  IMAGE_TOO_LARGE_MESSAGE,
  isImageBase64TooLarge,
  MAX_IMAGE_BASE64_LENGTH,
  resolveImageMimeType,
  validateFoodCheckText,
} from './foodCheckInput';

describe('isImageBase64TooLarge', () => {
  it('한도 이하면 false', () => {
    expect(isImageBase64TooLarge('a'.repeat(MAX_IMAGE_BASE64_LENGTH))).toBe(false);
  });

  it('한도를 넘으면 true', () => {
    expect(isImageBase64TooLarge('a'.repeat(MAX_IMAGE_BASE64_LENGTH + 1))).toBe(true);
  });

  it('한도는 약 4MB(5,300,000자)', () => {
    expect(MAX_IMAGE_BASE64_LENGTH).toBe(5_300_000);
  });

  it('안내 문구', () => {
    expect(IMAGE_TOO_LARGE_MESSAGE).toBe('사진이 너무 커요. 다른 사진을 골라주세요');
  });
});

describe('resolveImageMimeType', () => {
  it('jpeg/jpg는 image/jpeg', () => {
    expect(resolveImageMimeType('image/jpeg')).toBe('image/jpeg');
    expect(resolveImageMimeType('image/jpg')).toBe('image/jpeg');
  });

  it('png는 image/png', () => {
    expect(resolveImageMimeType('image/png')).toBe('image/png');
  });

  it('모르면 jpeg로 본다 (quality < 1이면 피커가 JPEG로 다시 인코딩)', () => {
    expect(resolveImageMimeType(undefined)).toBe('image/jpeg');
    expect(resolveImageMimeType(null)).toBe('image/jpeg');
  });

  it('그 밖의 형식은 null', () => {
    expect(resolveImageMimeType('image/heic')).toBeNull();
    expect(resolveImageMimeType('image/gif')).toBeNull();
  });
});

describe('validateFoodCheckText', () => {
  it('앞뒤 공백을 지운 글자를 돌려준다', () => {
    expect(validateFoodCheckText('  삼각김밥  ')).toEqual({ ok: true, text: '삼각김밥' });
  });

  it('비어 있으면 실패', () => {
    expect(validateFoodCheckText('   ')).toEqual({
      ok: false,
      message: '상품 이름을 입력해 주세요',
    });
  });

  it('50자까지 허용', () => {
    expect(validateFoodCheckText('가'.repeat(50))).toEqual({ ok: true, text: '가'.repeat(50) });
  });

  it('50자를 넘으면 실패', () => {
    expect(validateFoodCheckText('가'.repeat(51))).toEqual({
      ok: false,
      message: '상품 이름은 50자까지 입력할 수 있어요',
    });
  });
});
