/// <reference lib="deno.ns" />

// 편의점 판정 원본 사진 정리 배치: cron 등 service role 호출로만 실행한다.
// 30일 지난 원본을 스토리지에서 지우고 food_check.image_path를 null로 만든다 (썸네일은 유지).
// 스토리지가 실제로 지웠다고 돌려준 원본의 행만 null로 바꾸므로 나머지는 다음 실행에서 다시 시도된다.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireEnv } from '../_shared/auth.ts';
import {
  DAY_MS,
  partitionRemoved,
  RETENTION_DAYS,
  selectExpired,
} from '../_shared/foodCheckCleanup.ts';
import { isServiceRoleRequest } from '../_shared/serviceRole.ts';
import { fetchAllPages } from '../delete-unused-images/cleanup.ts';

const BUCKET = 'food-check';
const BATCH_SIZE = 100;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

serve(async (req: Request) => {
  try {
    if (!isServiceRoleRequest(req.headers.get('Authorization'))) {
      return json({ error: 'forbidden' }, 403);
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString();

    // 1000행 제한 없이 전부 읽는다 (삭제 전에 모두 읽어 두므로 페이지가 밀리지 않음)
    const rows = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('food_check')
        .select('id, image_path, created_at')
        .not('image_path', 'is', null)
        .lte('created_at', cutoff)
        .order('id')
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    });
    const expired = selectExpired(rows, now, RETENTION_DAYS);

    let deleted = 0;
    let failed = 0;
    let missing = 0;
    for (let i = 0; i < expired.length; i += BATCH_SIZE) {
      const batch = expired.slice(i, i + BATCH_SIZE);
      const { data: removedFiles, error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove(batch.map((row) => row.image_path));
      if (removeError) {
        console.error('원본 삭제 실패:', removeError.message);
        failed += batch.length;
        continue;
      }

      // 돌려받지 못한 경로는 이미 없는 객체인지 아직 남은 것인지 구분할 수 없으므로 행을 그대로 두고
      // 다음 실행에서 다시 시도한다 (경로를 잃어 원본이 영영 남는 쪽보다 안전)
      const { removedIds, notRemoved } = partitionRemoved(
        batch,
        (removedFiles ?? []).map((file) => file.name)
      );
      missing += notRemoved.length;
      failed += notRemoved.length;
      if (removedIds.length === 0) continue;

      const { error: updateError } = await supabase
        .from('food_check')
        .update({ image_path: null })
        .in('id', removedIds);
      if (updateError) {
        console.error('image_path 비우기 실패:', updateError.message);
        failed += removedIds.length;
        continue;
      }
      deleted += removedIds.length;
    }

    return json({ checked: expired.length, deleted, failed, missing }, 200);
  } catch (error) {
    // 오류 상세는 로그에만 남기고 응답에는 담지 않는다
    console.error('판정 사진 정리 실패:', error);
    return json({ error: 'internal error' }, 500);
  }
});
