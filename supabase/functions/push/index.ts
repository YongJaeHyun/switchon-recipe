/// <reference lib="deno.ns" />
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildPushMessage, type ChannelType, type NotificationType } from './message.ts';

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
  const { uid } = payload.record;
  console.log('Notification:', payload.record.type, payload.record.id);

  const { data: profiles } = await supabase
    .from('user')
    .select('push_token')
    .eq('id', uid)
    .single();

  const message = buildPushMessage(payload.record, profiles?.push_token);
  if (!message) {
    return new Response(JSON.stringify({ skipped: 'no push token' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`,
    },
    body: JSON.stringify(message),
  }).then((res) => res.json());
  console.log('Push Notification Response:', res);

  return new Response(JSON.stringify(res), {
    headers: { 'Content-Type': 'application/json' },
  });
});
