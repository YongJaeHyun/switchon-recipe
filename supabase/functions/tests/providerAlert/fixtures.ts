// 2026-10-27 운영에서 받은 Gemini 402 응답 (선불 크레딧 소진). 첫 문장과 status는 실제 값, 뒤 문장은 같은 형식의 안내문
export const GEMINI_402_BODY = JSON.stringify({
  error: {
    code: 402,
    message:
      'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.',
    status: 'RESOURCE_EXHAUSTED',
  },
});
