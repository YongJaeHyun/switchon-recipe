/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildRequesterNotification,
  decideFinalStatus,
  findExactMatch,
  findHiddenIngredient,
  hiddenRejectionReport,
  getProcessMode,
  isBlockedByPriorRequests,
  isServiceRoleRequest,
  withDeadline,
} from './core.ts';
import { createImageDeps, findIngredientImage, type ImageDeps } from './image.ts';
import { judgeIngredient } from './judge.ts';
import { buildSlackMessage } from './slack.ts';
import type {
  CandidateIngredient,
  ExistingIngredient,
  IngredientOutcome,
  ProcessReport,
  RequestRecord,
  WebhookPayload,
} from './types.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const BUCKET = 'ingredient-images';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const IMAGE_SIZE = 640;
const JPEG_QUALITY = 80;
const UNIQUE_VIOLATION = '23505';
// 무료 플랜 wall clock(150초) 안에 상태 저장·Slack 보고까지 끝내기 위한 처리 시간 상한
const PROCESS_DEADLINE_MS = 120 * 1000;

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
};

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const loadExistingIngredients = async (): Promise<ExistingIngredient[]> => {
  const { data, error } = await supabase
    .from('ingredient')
    .select('id, name, sub_keywords, week, is_carbohydrate, is_active');
  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    subKeywords: row.sub_keywords ?? [],
    week: row.week,
    isCarbohydrate: row.is_carbohydrate,
    isActive: row.is_active,
  }));
};

// 같은 이름의 요청이 이미 처리됐거나, 더 먼저 들어와 처리 중인지
const hasPriorRequest = async (record: RequestRecord) => {
  const { data, error } = await supabase
    .from('ingredient_request')
    .select('id, status, created_at')
    .eq('normalized_name', record.normalized_name)
    .neq('id', record.id);
  if (error) throw error;

  return isBlockedByPriorRequests(record, data);
};

// 웹훅 payload 대신 DB의 현재 값을 사용 (이미 처리된 요청이면 null)
const loadPendingRequest = async (id: number): Promise<RequestRecord | null> => {
  const { data, error } = await supabase
    .from('ingredient_request')
    .select('id, uid, name, normalized_name, status, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.status === 'pending' ? data : null;
};

const toSquareJpeg = async (bytes: Uint8Array) => {
  const image = await Image.decode(bytes);
  const size = Math.min(image.width, image.height);
  const cropped = image.crop((image.width - size) / 2, (image.height - size) / 2, size, size);
  return cropped.resize(IMAGE_SIZE, IMAGE_SIZE).encodeJPEG(JPEG_QUALITY);
};

const loadNextSortOrder = async () => {
  const { data, error } = await supabase
    .from('ingredient')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data[0]?.sort_order ?? -1) + 1;
};

const addCandidate = async (
  candidate: CandidateIngredient,
  requestId: number,
  sortOrder: number,
  imageDeps: ImageDeps
): Promise<IngredientOutcome> => {
  const found = await findIngredientImage(candidate, imageDeps);
  if (!found) return { candidate, status: 'failed', error: '맞는 이미지 없음' };

  const path = `auto/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, await toSquareJpeg(found.bytes), { contentType: 'image/jpeg' });
  if (uploadError) throw new Error(`이미지 업로드 실패: ${uploadError.message}`);

  const imageUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { data: inserted, error: insertError } = await supabase
    .from('ingredient')
    .insert({
      name: candidate.name,
      sub_keywords: candidate.subKeywords,
      week: candidate.week,
      is_carbohydrate: candidate.isCarbohydrate,
      image_url: imageUrl,
      image_source: found.source,
      source: 'auto',
      sort_order: sortOrder,
      request_id: requestId,
      ai_reason: candidate.reason,
    })
    .select('id')
    .single();

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    if (insertError.code === UNIQUE_VIOLATION) {
      return { candidate, status: 'failed', error: '이미 존재하는 재료' };
    }
    throw new Error(`재료 저장 실패: ${insertError.message}`);
  }

  return {
    candidate,
    status: 'added',
    imageUrl,
    imageSource: found.source,
    ingredientId: inserted.id,
  };
};

const buildReport = async (
  record: RequestRecord,
  mode: 'new' | 'retry'
): Promise<ProcessReport> => {
  const base = { requestName: record.name, outcomes: [] };
  const existing = await loadExistingIngredients();

  // 숨긴 재료 확인이 먼저: 롤백한 재료는 예전 'added' 요청이 있어 아래 중복 확인에 걸리기 때문
  const hidden = findHiddenIngredient(record.name, existing);
  if (hidden) return hiddenRejectionReport(record.name, hidden);

  if (mode === 'new' && (await hasPriorRequest(record))) {
    return { ...base, status: 'duplicate', reason: '이미 처리되었거나 처리 중인 요청' };
  }
  const match = findExactMatch(record.name, existing);
  if (match) {
    return { ...base, status: 'duplicate', reason: '이미 등록된 재료', matchedName: match.name };
  }

  const geminiKey = requireEnv('GEMINI_API_KEY');
  const judgement = await judgeIngredient(record.name, existing, geminiKey);

  if (judgement.decision === 'reject') {
    return { ...base, status: 'rejected', reason: judgement.reason };
  }
  if (judgement.decision === 'duplicate') {
    const hiddenMatch = findHiddenIngredient(judgement.matchedName, existing);
    if (hiddenMatch) return hiddenRejectionReport(record.name, hiddenMatch);
    return {
      ...base,
      status: 'duplicate',
      reason: judgement.reason,
      matchedName: judgement.matchedName,
    };
  }

  const imageDeps = createImageDeps({ geminiKey, pixabayKey: requireEnv('PIXABAY_API_KEY') });
  const baseSortOrder = await loadNextSortOrder();

  // 후보는 최대 4개라 병렬 처리 (순차 처리 시 실행 시간 제한을 넘을 수 있음)
  const outcomes: IngredientOutcome[] = await Promise.all(
    judgement.ingredients.map((candidate, index) =>
      addCandidate(candidate, record.id, baseSortOrder + index, imageDeps).catch(
        (error): IngredientOutcome => ({ candidate, status: 'failed', error: errorMessage(error) })
      )
    )
  );

  return { ...base, status: decideFinalStatus(outcomes), reason: judgement.reason, outcomes };
};

const sendSlack = async (report: ProcessReport) => {
  try {
    const res = await fetch(requireEnv('INGREDIENT_SLACK_WEBHOOK_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSlackMessage(report)),
    });
    if (!res.ok) console.error(`Slack 전송 실패 (${res.status}): ${await res.text()}`);
  } catch (error) {
    console.error('Slack 전송 실패:', error);
  }
};

// 요청한 유저에게 결과 푸시 (notifications insert → 기존 push 함수가 발송)
const notifyRequester = async (record: RequestRecord, report: ProcessReport) => {
  const notification = buildRequesterNotification(report);
  if (!record.uid || !notification) return;

  const { error } = await supabase.from('notifications').insert({
    uid: record.uid,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    channel_id: 'INGREDIENT',
    type: 'INGREDIENT_REQUEST',
  });
  if (error) console.error('재료 요청 결과 알림 저장 실패:', error);
};

const processRequest = async (record: RequestRecord, mode: 'new' | 'retry') => {
  let report: ProcessReport;

  try {
    report = await withDeadline(buildReport(record, mode), PROCESS_DEADLINE_MS);
  } catch (error) {
    console.error(error);
    report = {
      requestName: record.name,
      status: 'failed',
      reason: '',
      outcomes: [],
      error: errorMessage(error),
    };
  }

  const { error } = await supabase
    .from('ingredient_request')
    .update({ status: report.status, result: report })
    .eq('id', record.id);
  if (error) console.error('요청 상태 저장 실패:', error);

  await sendSlack(report);
  await notifyRequester(record, report);
};

serve(async (req: Request) => {
  // Database Webhook(service role)만 허용. anon 키나 유저 토큰으로 직접 호출하는 것을 차단
  if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const mode = getProcessMode(payload);
    const record = mode && payload.record ? await loadPendingRequest(payload.record.id) : null;

    if (!mode || !record) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    EdgeRuntime.waitUntil(processRequest(record, mode));
    return new Response(JSON.stringify({ accepted: true }), { status: 202 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: errorMessage(error) }), { status: 500 });
  }
});
