import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { formatKoreanDate } from './formatKoreanDate.ts';

serve(async (req: Request) => {
  try {
    const { id, uid, title, message, created_at } = await req.json();

    const baseUrl = Deno.env.get('INQUIRY_URL');
    if (!baseUrl) throw new Error('INQUIRY_URL not set');

    const templateMessage = `📩 새 문의가 도착했습니다!\n\nUUID: ${uid}\n제목: ${title}\n내용: ${message}\n접수일자: ${formatKoreanDate(created_at)}\n링크: ${baseUrl + id}`;

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
