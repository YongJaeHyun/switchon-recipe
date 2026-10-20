// food-check 엣지 함수 응답·food_check 행·get_premium_quota 응답 해석 (순수 함수)
import type {
  FoodCheckBasis,
  FoodCheckInputType,
  FoodCheckOutcome,
  FoodCheckRecord,
  FoodCheckRow,
  FoodCheckVerdict,
  PremiumQuotaStatus,
} from 'types/foodCheck';
import { PREMIUM_QUOTA_EXCEEDED_MESSAGE } from './foodCheckDisplay';
import { IMAGE_TOO_LARGE_MESSAGE } from './foodCheckInput';

const UNRECOGNIZED_FALLBACK = '제품명이 잘 보이게 다시 찍어주세요';
const ERROR_MESSAGE = '판정에 실패했어요. 잠시 후 다시 시도해 주세요';
const INVALID_FALLBACK = '입력을 확인해 주세요';

const asObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const isRecord = (value: unknown): value is FoodCheckRecord => {
  const v = asObject(value);
  return !!v && typeof v.id === 'number' && typeof v.createdAt === 'string';
};

export function interpretFoodCheckResponse(status: number, body: unknown): FoodCheckOutcome {
  const b = asObject(body);

  if (status === 200) {
    if (b?.status === 'ok' && isRecord(b.check)) return { status: 'ok', check: b.check };
    if (b?.status === 'unrecognized') {
      return {
        status: 'unrecognized',
        message: typeof b.message === 'string' && b.message ? b.message : UNRECOGNIZED_FALLBACK,
      };
    }
    return { status: 'error', message: ERROR_MESSAGE };
  }
  if (status === 402) return { status: 'locked' };
  if (status === 429) return { status: 'quotaExceeded', message: PREMIUM_QUOTA_EXCEEDED_MESSAGE };
  if (status === 413) return { status: 'tooLarge', message: IMAGE_TOO_LARGE_MESSAGE };
  if (status === 400) {
    return {
      status: 'invalid',
      message: typeof b?.error === 'string' && b.error ? b.error : INVALID_FALLBACK,
    };
  }
  return { status: 'error', message: ERROR_MESSAGE };
}

const INPUT_TYPES: FoodCheckInputType[] = ['front', 'label', 'text'];

export function toFoodCheckRecord(row: FoodCheckRow, thumbUrl: string | null): FoodCheckRecord {
  const verdict: FoodCheckVerdict | null =
    row.verdict === 'ok' || row.verdict === 'avoid' ? row.verdict : null;
  const basis: FoodCheckBasis | null =
    row.basis === 'estimate' || row.basis === 'label' ? row.basis : null;
  const inputType = INPUT_TYPES.includes(row.input_type as FoodCheckInputType)
    ? (row.input_type as FoodCheckInputType)
    : 'text';

  return {
    id: row.id,
    uid: row.uid,
    inputType,
    inputText: row.input_text,
    imagePath: row.image_path,
    thumbPath: row.thumb_path,
    productName: row.product_name,
    score: row.score,
    verdict,
    basis,
    reasons: row.reasons,
    alternatives: row.alternatives,
    week: row.week,
    createdAt: row.created_at,
    thumbUrl,
  };
}

export function parsePremiumQuotaStatus(data: unknown): PremiumQuotaStatus | null {
  const d = asObject(data);
  if (
    !d ||
    typeof d.used !== 'number' ||
    typeof d.limit !== 'number' ||
    typeof d.remaining !== 'number'
  ) {
    return null;
  }
  return { used: d.used, limit: d.limit, remaining: d.remaining };
}
