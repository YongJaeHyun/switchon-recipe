// 편의점 판정 입력(사진/글자) 검사. 서버(food-check)도 다시 검사한다
import type { FoodCheckMimeType } from 'types/foodCheck';

// base64 길이 상한. 서버(food-check MAX_BODY_BYTES = 4MB)는 base64가 든 JSON 본문 전체 바이트를 재므로
// 그 한도에서 JSON 감싸개({"type":..,"mimeType":..}) 여유 1KB를 뺀다
export const MAX_IMAGE_BASE64_LENGTH = 4 * 1024 * 1024 - 1024;
export const IMAGE_TOO_LARGE_MESSAGE = '사진이 너무 커요. 다른 사진을 골라주세요';
export const MAX_FOOD_CHECK_TEXT_LENGTH = 50;

export function isImageBase64TooLarge(base64: string): boolean {
  return base64.length > MAX_IMAGE_BASE64_LENGTH;
}

// 피커가 알려준 형식을 서버가 받는 형식으로. 모르면 JPEG로 본다
// (quality < 1이면 Android 피커가 JPEG로 다시 인코딩한다). 지원하지 않는 형식이면 null
export function resolveImageMimeType(
  mimeType: string | null | undefined
): FoodCheckMimeType | null {
  if (!mimeType) return 'image/jpeg';
  const lower = mimeType.toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return 'image/jpeg';
  if (lower === 'image/png') return 'image/png';
  return null;
}

export type TextValidation = { ok: true; text: string } | { ok: false; message: string };

export function validateFoodCheckText(raw: string): TextValidation {
  const text = raw.trim();
  if (text.length < 1) return { ok: false, message: '상품 이름을 입력해 주세요' };
  if (text.length > MAX_FOOD_CHECK_TEXT_LENGTH) {
    return {
      ok: false,
      message: `상품 이름은 ${MAX_FOOD_CHECK_TEXT_LENGTH}자까지 입력할 수 있어요`,
    };
  }
  return { ok: true, text };
}
