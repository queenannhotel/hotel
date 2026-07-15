// Supabase Edge Function: send-push
// Gửi Web Push tới tất cả thiết bị đã đăng ký (trừ máy gửi).
// Deploy: Supabase Dashboard -> Edge Functions -> tạo function tên "send-push", dán file này, Deploy.
// Secrets cần đặt (Dashboard -> Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (vd: mailto:gm@queenannhotelvn.com)
// (SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY đã có sẵn trong môi trường Edge Function.)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC   = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE  = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT  = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { title, body, tag, url, excludeEndpoint } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, subscription");
    if (error) throw error;

    const payload = JSON.stringify({ title, body, tag, url });
    let sent = 0, removed = 0;

    await Promise.all((subs ?? []).map(async (row: any) => {
      if (excludeEndpoint && row.endpoint === excludeEndpoint) return;
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (e: any) {
        // 404/410 = subscription đã hết hạn -> xoá khỏi bảng
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
          removed++;
        } else {
          console.error("push error", row.endpoint, e?.statusCode, e?.body);
        }
      }
    }));

    return new Response(JSON.stringify({ ok: true, sent, removed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
