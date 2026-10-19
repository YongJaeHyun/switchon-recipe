/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchAllPages, findUnusedFiles } from './cleanup.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async () => {
  try {
    // ✅ 1. 스토리지에서 오래된 순으로 정렬된 1000개 파일 가져오기
    const { data: allFiles, error: listError } = await supabase.storage
      .from('recipe-images')
      .list('', {
        limit: 1000,
        sortBy: {
          column: 'created_at',
          order: 'asc',
        },
      });
    if (listError) throw listError;
    const files = allFiles || [];

    // ✅ 2. recipe 테이블의 image_uri 컬럼 조회
    // 1000행 제한 없이 모든 레시피의 image_uri 조회
    const recipes = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from('recipe')
        .select('image_uri')
        .order('id')
        .range(from, to);
      if (error) throw error;
      return data;
    });

    // ✅ 3~4. 스토리지 내 파일 중 어떤 레시피도 쓰지 않는 것 찾기
    const unusedFiles = findUnusedFiles(
      files.map((file) => file.name),
      recipes.map((r) => r.image_uri)
    );
    console.log(`🧹 삭제 대상 파일 개수: ${unusedFiles.length}`);

    // ✅ 5. 삭제 실행
    if (unusedFiles.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from('recipe-images')
        .remove(unusedFiles);
      if (deleteError) throw deleteError;
    }

    return new Response(
      JSON.stringify({
        message: 'Cleanup complete',
        checked: files.length,
        deleted: unusedFiles.length,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
