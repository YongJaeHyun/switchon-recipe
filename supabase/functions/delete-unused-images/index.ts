/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
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
    const { data: recipes, error: recipeError } = await supabase.from('recipe').select('image_uri');
    if (recipeError) throw recipeError;

    // ✅ 3. DB에 등록된 이미지 파일명 (.jpg 등 확장자 포함) 추출
    const usedFileNames = new Set(
      recipes
        .map((r) => r.image_uri?.split('/').pop()?.split('?')[0]) // 파일명만 추출
        .filter(Boolean)
    );

    // ✅ 4. 스토리지 내 파일 중 DB에 없는 것 찾기
    const unusedFiles = files
      .filter((file) => !usedFileNames.has(file.name))
      .map((file) => file.name);
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
        error: err.message,
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
