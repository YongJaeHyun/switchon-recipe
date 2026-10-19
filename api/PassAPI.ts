import { supabase } from 'lib/supabase';
import type { PassPurchase, PassStatus, VerifyResult } from 'types/pass';
import { captureError } from 'utils/sendError';

// 실패 시 throw: 호출부(React Query, 결제 흐름)가 재시도/표시를 정한다
const getStatus = async (): Promise<PassStatus> => {
  const { data, error } = await supabase.functions.invoke<PassStatus>('get-pass-status', {
    method: 'POST',
  });

  if (error || !data) {
    captureError({ error: error ?? new Error('empty response'), prefix: '[PassAPI.getStatus]: ' });
    throw error ?? new Error('get-pass-status: empty response');
  }
  return data;
};

// 서버가 Play 검증, 만료일 갱신, 구매 소비까지 한다. 결과 상태는 모두 200으로 온다
const verify = async (input: PassPurchase): Promise<VerifyResult> => {
  const { data, error } = await supabase.functions.invoke<VerifyResult>('verify-pass-purchase', {
    body: input,
  });

  if (error || !data) {
    captureError({ error: error ?? new Error('empty response'), prefix: '[PassAPI.verify]: ' });
    throw error ?? new Error('verify-pass-purchase: empty response');
  }
  return data;
};

export const PassAPI = {
  getStatus,
  verify,
};
