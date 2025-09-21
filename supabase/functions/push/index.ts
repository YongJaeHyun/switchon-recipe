/// <reference lib="deno.ns" />
import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationType = 'INQUIRY';
type ChannelType = 'INQUIRY';

interface Notification {
  id: string;
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  channel_id: ChannelType;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Notification;
  schema: 'public';
  old_record: null | Notification;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const payload: WebhookPayload = await req.json();
  const { uid, title, body, href, channel_id } = payload.record;

  const { data: user } = await supabase.from('user').select('push_token').eq('id', uid).single();

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`,
    },
    body: JSON.stringify({
      to: user?.push_token,
      sound: 'default',
      title,
      body,
      data: { href },
      channelId: channel_id,
    }),
  }).then((res) => res.json());

  return new Response(JSON.stringify(res), {
    headers: { 'Content-Type': 'application/json' },
  });
});
