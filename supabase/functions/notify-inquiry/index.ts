import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { formatKoreanDate } from './formatKoreanDate.ts';
import {
  buildInquirySlackText,
  INQUIRY_IMAGE_BUCKET,
  INQUIRY_IMAGE_LINK_SECONDS,
  toImagePaths,
} from './inquiryMessage.ts';

// 사진마다 7일짜리 서명 링크. 실패해도 알림은 보내야 하므로 실패한 사진은 null
const signImageUrls = async (paths: string[]): Promise<(string | null)[]> => {
  if (paths.length === 0) return [];
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');

    const supabase = createClient(url, key);
    const { data, error } = await supabase.storage
      .from(INQUIRY_IMAGE_BUCKET)
      .createSignedUrls(paths, INQUIRY_IMAGE_LINK_SECONDS);
    if (error || !data) throw error ?? new Error('createSignedUrls: empty response');

    const byPath = new Map<string, string>();
    for (const item of data) {
      if (item.path && item.signedUrl && !item.error) byPath.set(item.path, item.signedUrl);
    }
    return paths.map((path) => byPath.get(path) ?? null);
  } catch (error) {
    console.error('[notify-inquiry] sign images failed', error);
    return paths.map(() => null);
  }
};

serve(async (req: Request) => {
  try {
    const { id, uid, title, message, category, created_at, image_paths } = await req.json();

    const baseUrl = Deno.env.get('INQUIRY_URL');
    if (!baseUrl) throw new Error('INQUIRY_URL not set');

    const imageUrls = await signImageUrls(toImagePaths(image_paths, String(uid)));

    const templateMessage = buildInquirySlackText({
      uid,
      title,
      message,
      category: typeof category === 'string' ? category : null,
      createdAtText: formatKoreanDate(created_at),
      link: baseUrl + id,
      imageUrls,
    });

    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!webhookUrl) throw new Error('SLACK_WEBHOOK_URL not set');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: templateMessage }),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
