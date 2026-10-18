/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decideFinalStatus, findExactMatch, formatSlackReport, getProcessMode } from './core.ts';
import { createImageDeps, findIngredientImage, type ImageDeps } from './image.ts';
import { judgeIngredient } from './judge.ts';
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

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} not set`);
  return value;
};

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

const loadExistingIngredients = async (): Promise<ExistingIngredient[]> => {
  const { data, error } = await supabase
    .from('ingredient')
    .select('name, sub_keywords, week, is_carbohydrate, is_active');
  if (error) throw error;

  return data.map((row) => ({
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
    .select('id, status')
    .eq('normalized_name', record.normalized_name)
    .neq('id', record.id);
  if (error) throw error;

  return data.some(
    (r) =>
      ['added', 'duplicate', 'rejected'].includes(r.status) ||
      (r.status === 'pending' && r.id < record.id)
  );
};

const toSquareJpeg = async (bytes: Uint8Array) => {
  const image = await Image.decode(bytes);
  const size = Math.min(image.width, image.height);
  const cropped = image.crop((image.width - size) / 2, (image.height - size) / 2, size, size);
  return cropped.resize(IMAGE_SIZE, IMAGE_SIZE).encodeJPEG(JPEG_QUALITY);
};

const nextSortOrder = async () => {
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

  const { error: insertError } = await supabase.from('ingredient').insert({
    name: candidate.name,
    sub_keywords: candidate.subKeywords,
    week: candidate.week,
    is_carbohydrate: candidate.isCarbohydrate,
    image_url: imageUrl,
    image_source: found.source,
    source: 'auto',
    sort_order: await nextSortOrder(),
    request_id: requestId,
    ai_reason: candidate.reason,
  });

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    if (insertError.code === UNIQUE_VIOLATION) {
      return { candidate, status: 'failed', error: '이미 존재하는 재료' };
    }
    throw new Error(`재료 저장 실패: ${insertError.message}`);
  }

  return { candidate, status: 'added', imageUrl, imageSource: found.source };
};

const buildReport = async (
  record: RequestRecord,
  mode: 'new' | 'retry'
): Promise<ProcessReport> => {
  const base = { requestName: record.name, outcomes: [] };

  if (mode === 'new' && (await hasPriorRequest(record))) {
    return { ...base, status: 'duplicate', reason: '이미 처리되었거나 처리 중인 요청' };
  }

  const existing = await loadExistingIngredients();
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
    return {
      ...base,
      status: 'duplicate',
      reason: judgement.reason,
      matchedName: judgement.matchedName,
    };
  }

  const imageDeps = createImageDeps({ geminiKey, pixabayKey: requireEnv('PIXABAY_API_KEY') });
  const outcomes: IngredientOutcome[] = [];

  for (const candidate of judgement.ingredients) {
    try {
      outcomes.push(await addCandidate(candidate, record.id, imageDeps));
    } catch (error) {
      outcomes.push({ candidate, status: 'failed', error: errorMessage(error) });
    }
  }

  return { ...base, status: decideFinalStatus(outcomes), reason: judgement.reason, outcomes };
};

const sendSlack = async (report: ProcessReport) => {
  try {
    const res = await fetch(requireEnv('INGREDIENT_SLACK_WEBHOOK_URL'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: formatSlackReport(report) }),
    });
    if (!res.ok) console.error(`Slack 전송 실패 (${res.status}): ${await res.text()}`);
  } catch (error) {
    console.error('Slack 전송 실패:', error);
  }
};

const processRequest = async (record: RequestRecord, mode: 'new' | 'retry') => {
  let report: ProcessReport;

  try {
    report = await buildReport(record, mode);
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
};

serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    const mode = getProcessMode(payload);

    if (!mode || !payload.record) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    EdgeRuntime.waitUntil(processRequest(payload.record, mode));
    return new Response(JSON.stringify({ accepted: true }), { status: 202 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: errorMessage(error) }), { status: 500 });
  }
});
