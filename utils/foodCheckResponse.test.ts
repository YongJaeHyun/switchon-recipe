import { describe, expect, it } from 'vitest';
import {
  classifyFoodCheckRequestError,
  FOOD_CHECK_TIMEOUT_MESSAGE,
  interpretFoodCheckResponse,
  parsePremiumQuotaStatus,
  toFoodCheckRecord,
} from './foodCheckResponse';

const record = {
  id: 1,
  uid: 'u1',
  inputType: 'text',
  inputText: '삼각김밥',
  imagePath: null,
  thumbPath: null,
  productName: '참치마요 삼각김밥',
  score: 3,
  verdict: 'avoid',
  basis: 'estimate',
  reasons: ['흰쌀밥 위주예요'],
  alternatives: ['구운 계란'],
  week: 1,
  createdAt: '2026-10-20T00:00:00Z',
  thumbUrl: null,
};

describe('interpretFoodCheckResponse', () => {
  it('200 ok', () => {
    expect(interpretFoodCheckResponse(200, { status: 'ok', check: record })).toEqual({
      status: 'ok',
      check: record,
    });
  });

  it('200 unrecognized는 서버 문구를 쓴다', () => {
    expect(
      interpretFoodCheckResponse(200, { status: 'unrecognized', message: '다시 찍어주세요' })
    ).toEqual({ status: 'unrecognized', message: '다시 찍어주세요' });
  });

  it('200 unrecognized에 문구가 없으면 기본 문구', () => {
    expect(interpretFoodCheckResponse(200, { status: 'unrecognized' })).toEqual({
      status: 'unrecognized',
      message: '제품명이 잘 보이게 다시 찍어주세요',
    });
  });

  it('200인데 모양이 어긋나면 error', () => {
    expect(interpretFoodCheckResponse(200, { status: 'ok' }).status).toBe('error');
    expect(interpretFoodCheckResponse(200, null).status).toBe('error');
  });

  it('402는 locked', () => {
    expect(interpretFoodCheckResponse(402, { error: '패스가 필요한 기능입니다.' })).toEqual({
      status: 'locked',
    });
  });

  it('429 PREMIUM_QUOTA_EXCEEDED는 quotaExceeded + 고정 문구', () => {
    expect(
      interpretFoodCheckResponse(429, { code: 'PREMIUM_QUOTA_EXCEEDED', error: 'x', remaining: 0 })
    ).toEqual({
      status: 'quotaExceeded',
      message: '오늘 판정을 모두 사용했어요 · 자정에 다시 채워져요',
    });
  });

  it('413은 tooLarge', () => {
    expect(interpretFoodCheckResponse(413, { error: '사진 용량이 너무 커요' })).toEqual({
      status: 'tooLarge',
      message: '사진이 너무 커요. 다른 사진을 골라주세요',
    });
  });

  it('400은 서버 문구로 invalid', () => {
    expect(
      interpretFoodCheckResponse(400, { error: '상품 이름은 1~50자로 입력해 주세요' })
    ).toEqual({ status: 'invalid', message: '상품 이름은 1~50자로 입력해 주세요' });
  });

  it('그 밖의 상태는 error', () => {
    expect(interpretFoodCheckResponse(500, { error: '판정에 실패했어요' })).toEqual({
      status: 'error',
      message: '판정에 실패했어요. 잠시 후 다시 시도해 주세요',
    });
  });
});

describe('toFoodCheckRecord', () => {
  it('snake_case 행을 camelCase 기록으로 바꾸고 썸네일 URL을 붙인다', () => {
    expect(
      toFoodCheckRecord(
        {
          id: 2,
          uid: 'u1',
          input_type: 'front',
          input_text: null,
          image_path: 'u1/2.jpg',
          thumb_path: 'u1/2_thumb.jpg',
          product_name: '구운 계란',
          score: 9,
          verdict: 'ok',
          basis: 'estimate',
          reasons: ['단백질'],
          alternatives: null,
          week: 2,
          created_at: '2026-10-20T01:00:00Z',
        },
        'https://signed'
      )
    ).toEqual({
      id: 2,
      uid: 'u1',
      inputType: 'front',
      inputText: null,
      imagePath: 'u1/2.jpg',
      thumbPath: 'u1/2_thumb.jpg',
      productName: '구운 계란',
      score: 9,
      verdict: 'ok',
      basis: 'estimate',
      reasons: ['단백질'],
      alternatives: null,
      week: 2,
      createdAt: '2026-10-20T01:00:00Z',
      thumbUrl: 'https://signed',
    });
  });

  it('알 수 없는 verdict/basis는 null', () => {
    const r = toFoodCheckRecord(
      {
        id: 3,
        uid: 'u1',
        input_type: 'text',
        input_text: '라면',
        image_path: null,
        thumb_path: null,
        product_name: null,
        score: null,
        verdict: 'weird',
        basis: 'weird',
        reasons: null,
        alternatives: null,
        week: null,
        created_at: '2026-10-20T01:00:00Z',
      },
      null
    );
    expect(r.verdict).toBeNull();
    expect(r.basis).toBeNull();
  });
});

describe('parsePremiumQuotaStatus', () => {
  it('정상 응답', () => {
    expect(parsePremiumQuotaStatus({ used: 3, limit: 30, remaining: 27 })).toEqual({
      used: 3,
      limit: 30,
      remaining: 27,
    });
  });

  it('모양이 어긋나면 null', () => {
    expect(parsePremiumQuotaStatus(null)).toBeNull();
    expect(parsePremiumQuotaStatus({ used: 3, limit: '30', remaining: 27 })).toBeNull();
  });
});

describe('classifyFoodCheckRequestError', () => {
  it('취소는 canceled', () => {
    expect(classifyFoodCheckRequestError({ name: 'CanceledError', code: 'ERR_CANCELED' })).toBe(
      'canceled'
    );
  });

  it('axios 시간 초과(ECONNABORTED, ETIMEDOUT)는 timeout', () => {
    expect(
      classifyFoodCheckRequestError({
        isAxiosError: true,
        code: 'ECONNABORTED',
        response: undefined,
      })
    ).toBe('timeout');
    expect(
      classifyFoodCheckRequestError({ isAxiosError: true, code: 'ETIMEDOUT', response: undefined })
    ).toBe('timeout');
  });

  it('응답 없는 axios 오류는 network', () => {
    expect(
      classifyFoodCheckRequestError({
        isAxiosError: true,
        code: 'ERR_NETWORK',
        response: undefined,
      })
    ).toBe('network');
  });

  it('fetch 네트워크 오류 문구도 network', () => {
    expect(classifyFoodCheckRequestError(new Error('Network request failed'))).toBe('network');
  });

  it('그 밖은 unknown', () => {
    expect(classifyFoodCheckRequestError(new Error('boom'))).toBe('unknown');
    expect(classifyFoodCheckRequestError(null)).toBe('unknown');
  });

  it('시간 초과 안내 문구', () => {
    expect(FOOD_CHECK_TIMEOUT_MESSAGE).toBe(
      '판정이 오래 걸리고 있어요. 잠시 후 기록에서 확인해 주세요'
    );
  });
});
