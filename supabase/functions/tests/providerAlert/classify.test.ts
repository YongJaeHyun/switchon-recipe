import { describe, expect, it } from 'vitest';
import {
  buildFailureMessage,
  buildRecoveryMessage,
  classifyProviderFailure,
  modelOfUrl,
  providerOfUrl,
  redactSecrets,
  summarizeDetail,
} from '../../_shared/providerAlert.ts';
import { GEMINI_402_BODY } from './fixtures.ts';

const googleError = (code: number, status: string, message: string, details: unknown[] = []) =>
  JSON.stringify({ error: { code, message, status, details } });

const GEMINI_429_DAILY = googleError(
  429,
  'RESOURCE_EXHAUSTED',
  'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.',
  [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [
        {
          quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
          quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
        },
      ],
    },
  ]
);

const GEMINI_429_PER_MINUTE = googleError(
  429,
  'RESOURCE_EXHAUSTED',
  'You exceeded your current quota, please check your plan and billing details.',
  [
    {
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }],
    },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '23s' },
  ]
);

const GEMINI_400_BAD_KEY = googleError(
  400,
  'INVALID_ARGUMENT',
  'API key not valid. Please pass a valid API key.',
  [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }]
);

const GEMINI_403_LEAKED = googleError(
  403,
  'PERMISSION_DENIED',
  'Your API key was reported as leaked. Please use another API key.'
);

const GEMINI_403_BILLING_DISABLED = googleError(
  403,
  'PERMISSION_DENIED',
  'This API method requires billing to be enabled.',
  [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'BILLING_DISABLED' }]
);

const GEMINI_403_SERVICE_DISABLED = googleError(
  403,
  'PERMISSION_DENIED',
  'Generative Language API has not been used in project 123 before or it is disabled.',
  [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }]
);

const GEMINI_503 = googleError(
  503,
  'UNAVAILABLE',
  'The model is overloaded. Please try again later.'
);
const GEMINI_500 = googleError(500, 'INTERNAL', 'An internal error has occurred.');
const GEMINI_404_MODEL = googleError(
  404,
  'NOT_FOUND',
  'models/imagen-4.0-generate-001 is not found for API version v1beta, or is not supported for predict.'
);
const GEMINI_400_BAD_REQUEST = googleError(
  400,
  'INVALID_ARGUMENT',
  'Invalid JSON payload received. Unknown name "foo": Cannot find field.'
);

describe('classifyProviderFailure', () => {
  it('Gemini 402 선불 크레딧 소진 응답은 billing', () => {
    expect(classifyProviderFailure(402, GEMINI_402_BODY)).toBe('billing');
  });

  it('402는 본문과 상관없이 billing (Pixabay 402 포함)', () => {
    expect(classifyProviderFailure(402, '')).toBe('billing');
    expect(classifyProviderFailure(402, '[ERROR 402] Payment Required')).toBe('billing');
  });

  it('하루 할당량 429(RESOURCE_EXHAUSTED)는 billing', () => {
    expect(classifyProviderFailure(429, GEMINI_429_DAILY)).toBe('billing');
  });

  it('선불·크레딧 문구가 있는 429는 billing', () => {
    expect(
      classifyProviderFailure(
        429,
        googleError(429, 'RESOURCE_EXHAUSTED', 'Your prepayment credits are depleted.')
      )
    ).toBe('billing');
    expect(classifyProviderFailure(429, 'Insufficient credits for this request')).toBe('billing');
  });

  it('결제 문구 없는 RESOURCE_EXHAUSTED·quota 429는 billing이 아니라 용량 문제(outage)', () => {
    const capacity = googleError(
      429,
      'RESOURCE_EXHAUSTED',
      'Resource has been exhausted (e.g. check quota).'
    );
    expect(classifyProviderFailure(429, capacity)).toBe('outage');
    // Google 429 안내문의 "check your plan and billing details"만으로는 billing이 아니다
    const genericQuota = googleError(
      429,
      'RESOURCE_EXHAUSTED',
      'You exceeded your current quota, please check your plan and billing details.'
    );
    expect(classifyProviderFailure(429, genericQuota)).toBe('outage');
  });

  it('분 단위 호출 제한 429와 결제 문구 없는 429는 알리지 않는다', () => {
    expect(classifyProviderFailure(429, GEMINI_429_PER_MINUTE)).toBeNull();
    expect(classifyProviderFailure(429, '[ERROR 429] API rate limit exceeded')).toBeNull();
  });

  it('API 키 문제는 auth (Gemini 400 API_KEY_INVALID, 403 유출, 401, Pixabay 400)', () => {
    expect(classifyProviderFailure(400, GEMINI_400_BAD_KEY)).toBe('auth');
    expect(classifyProviderFailure(403, GEMINI_403_LEAKED)).toBe('auth');
    expect(classifyProviderFailure(403, GEMINI_403_SERVICE_DISABLED)).toBe('auth');
    expect(classifyProviderFailure(401, '')).toBe('auth');
    expect(classifyProviderFailure(400, '[ERROR 400] Invalid or missing API key')).toBe('auth');
    expect(classifyProviderFailure(403, 'Forbidden')).toBe('auth');
  });

  it('403 BILLING_DISABLED는 PERMISSION_DENIED여도 billing', () => {
    expect(classifyProviderFailure(403, GEMINI_403_BILLING_DISABLED)).toBe('billing');
  });

  it('5xx는 outage', () => {
    expect(classifyProviderFailure(503, GEMINI_503)).toBe('outage');
    expect(classifyProviderFailure(500, GEMINI_500)).toBe('outage');
    expect(classifyProviderFailure(502, '<html>Bad Gateway</html>')).toBe('outage');
  });

  it('모델 404는 model', () => {
    expect(classifyProviderFailure(404, GEMINI_404_MODEL)).toBe('model');
  });

  it('요청 내용 문제(그 밖의 400, 모델 문구 없는 404)와 성공은 알리지 않는다', () => {
    expect(classifyProviderFailure(400, GEMINI_400_BAD_REQUEST)).toBeNull();
    expect(classifyProviderFailure(404, 'Not Found')).toBeNull();
    expect(classifyProviderFailure(200, '')).toBeNull();
    expect(classifyProviderFailure(409, '')).toBeNull();
  });
});

describe('modelOfUrl', () => {
  it('Gemini URL에서 모델 이름을 뽑고, 없으면 빈 문자열', () => {
    expect(
      modelOfUrl(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=x'
      )
    ).toBe('gemini-3-pro-image-preview');
    expect(modelOfUrl('https://pixabay.com/api/?key=x&q=salmon')).toBe('');
  });
});

describe('providerOfUrl', () => {
  it('Gemini·Pixabay API만 지켜본다', () => {
    expect(
      providerOfUrl(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=x'
      )
    ).toBe('gemini');
    expect(providerOfUrl('https://pixabay.com/api/?key=x&q=salmon')).toBe('pixabay');
    expect(providerOfUrl('https://cdn.pixabay.com/photo/2017/salmon.jpg')).toBeNull();
    expect(providerOfUrl('https://hooks.slack.com/services/x')).toBeNull();
  });
});

describe('redactSecrets / summarizeDetail', () => {
  it('URL의 key=와 Google API 키 모양 문자열을 지운다', () => {
    expect(redactSecrets('url (https://x/?key=AIzaSyAbc123&q=1)')).toBe(
      'url (https://x/?key=***&q=1)'
    );
    expect(redactSecrets('key AIzaSyA1234567890abcdefghijklmn used')).toBe('key *** used');
  });

  it('JSON의 "key": "..." 형태도 지운다', () => {
    expect(redactSecrets('{"key": "12345-abcdef", "q": "x"}')).toBe('{"key": "***", "q": "x"}');
    expect(redactSecrets('{"api_key":"s3cr3t"}')).toBe('{"api_key":"***"}');
  });

  it('Google 오류 JSON은 status: message로 짧게 줄인다', () => {
    expect(summarizeDetail(GEMINI_402_BODY)).toBe(
      'RESOURCE_EXHAUSTED: Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.'
    );
  });

  it('JSON이 아니면 공백을 줄이고 300자로 자른다', () => {
    expect(summarizeDetail('a\n\n b')).toBe('a b');
    const long = summarizeDetail('x'.repeat(1000));
    expect(long.length).toBe(301);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('Slack 메시지', () => {
  it('billing: 무엇이·어느 함수에서·추정 원인·충전 링크를 담는다', () => {
    const text = buildFailureMessage({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      kind: 'billing',
      functionName: 'create-recipe-by-gemini',
      status: 402,
      detail: summarizeDetail(GEMINI_402_BODY),
    });
    expect(text).toContain('🚨 [Gemini] 결제·크레딧 문제로 호출 실패 (HTTP 402)');
    expect(text).toContain('함수: create-recipe-by-gemini');
    expect(text).toContain('선불 크레딧 소진');
    expect(text).toContain('AI Studio에서 선불 크레딧 충전');
    expect(text).toContain('https://ai.studio/projects');
    expect(text).toContain('Your prepayment credits are depleted');
  });

  it('detail에 키가 섞여도 지운다', () => {
    const text = buildFailureMessage({
      provider: 'pixabay',
      model: '',
      kind: 'auth',
      functionName: 'process-ingredient-request',
      status: 400,
      detail: 'GET https://pixabay.com/api/?key=12345-abcdef&q=x',
    });
    expect(text).not.toContain('12345-abcdef');
    expect(text).toContain('PIXABAY_API_KEY');
  });

  it('복구 메시지', () => {
    expect(buildRecoveryMessage('gemini', 'gemini-2.5-flash', ['billing'], 'food-check')).toBe(
      '✅ [Gemini] 복구됨: food-check 호출(gemini-2.5-flash)이 다시 성공했습니다 (이전 알림: 결제·크레딧 문제로 호출 실패)'
    );
  });
});
