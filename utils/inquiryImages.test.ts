import { describe, expect, it } from 'vitest';
import {
  INQUIRY_IMAGE_MAX_BYTES,
  isInquiryImageTooLarge,
  makeInquiryImagePath,
  remainingInquiryImageSlots,
  resolveInquiryImageMimeType,
} from './inquiryImages';

describe('resolveInquiryImageMimeType', () => {
  it('모르면 JPEG로 본다 (quality < 1이면 피커가 JPEG로 다시 저장)', () => {
    expect(resolveInquiryImageMimeType(undefined)).toBe('image/jpeg');
    expect(resolveInquiryImageMimeType(null)).toBe('image/jpeg');
  });

  it('버킷이 받는 JPEG·PNG·WebP만 통과', () => {
    expect(resolveInquiryImageMimeType('image/JPG')).toBe('image/jpeg');
    expect(resolveInquiryImageMimeType('image/png')).toBe('image/png');
    expect(resolveInquiryImageMimeType('image/webp')).toBe('image/webp');
    expect(resolveInquiryImageMimeType('image/heic')).toBeNull();
    expect(resolveInquiryImageMimeType('image/gif')).toBeNull();
  });
});

describe('makeInquiryImagePath', () => {
  it('{uid}/{id}.{확장자}', () => {
    expect(makeInquiryImagePath('u-1', 'abc', 'image/jpeg')).toBe('u-1/abc.jpg');
    expect(makeInquiryImagePath('u-1', 'abc', 'image/png')).toBe('u-1/abc.png');
    expect(makeInquiryImagePath('u-1', 'abc', 'image/webp')).toBe('u-1/abc.webp');
  });
});

describe('isInquiryImageTooLarge', () => {
  it('base64를 바이트로 바꿔 5MB를 넘는지 본다', () => {
    const fits = 'a'.repeat((INQUIRY_IMAGE_MAX_BYTES / 3) * 4);
    expect(isInquiryImageTooLarge(fits)).toBe(false);
    expect(isInquiryImageTooLarge(fits + 'aaaa')).toBe(true);
  });

  it('패딩(=)은 바이트에 넣지 않는다', () => {
    expect(isInquiryImageTooLarge('aa==')).toBe(false);
  });
});

describe('remainingInquiryImageSlots', () => {
  it('3장에서 고른 만큼 뺀다, 음수는 0', () => {
    expect(remainingInquiryImageSlots(0)).toBe(3);
    expect(remainingInquiryImageSlots(2)).toBe(1);
    expect(remainingInquiryImageSlots(5)).toBe(0);
  });
});
