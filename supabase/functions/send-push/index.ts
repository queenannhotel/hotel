// Supabase Edge Function: send-push
// Gửi Web Push tới tất cả thiết bị đã đăng ký (trừ máy gửi).
// Deploy: Supabase Dashboard -> Edge Functions -> function tên "send-push", dán file này, Deploy.
// Secrets cần đặt (Dashboard -> Edge Functions -> Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (vd: mailto:gm@queenannhotelvn.com)
// (SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY đã có sẵn trong môi trường Edge Function.)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// .trim() để chống trường hợp secret bị dính khoảng trắng/xuống dòng khi dán.
const env = (k: string) => (Deno.env.get(k) ?? "").trim();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const VAPID_PUBLIC  = env("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = env("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = env("VAPID_SUBJECT") || "mailto:admin@example.com";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return json({ ok: false, error: "Thiếu secret VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY" }, 400);
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const { title, body, tag, url, tab, ownerEmail, excludeEndpoint } = await req.json();
    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, subscription, email");
    if (error) throw error;

    // Nạp user_perms (role + noti_tabs) khi cần lọc theo tab hoặc theo người tạo.
    const permByEmail: Record<string, any> = {};
    if (tab || ownerEmail) {
      const { data: perms } = await supabase
        .from("user_perms")
        .select("email, role, noti_tabs");
      for (const p of (perms ?? [])) permByEmail[(p as any).email] = p;
    }

    // Lọc theo tuỳ chọn nhận thông báo của từng user (user_perms.noti_tabs).
    // Nếu có `tab` và user có noti_tabs là MẢNG -> chỉ gửi khi noti_tabs chứa tab.
    // Nếu noti_tabs null / không có perm / không có email / không truyền tab -> vẫn gửi (tương thích ngược).
    const wantsTab = (email: string): boolean => {
      if (!tab) return true;
      const perm = email ? permByEmail[email] : null;
      if (!perm) return true;
      const nt = perm.noti_tabs;
      if (!Array.isArray(nt)) return true;   // chưa cấu hình -> gửi như cũ
      return nt.includes(tab);
    };

    // Lọc theo người tạo (vd đề xuất mua hàng): chỉ gửi cho người tạo + Kế toán/Giám đốc.
    // ownerEmail rỗng -> không giới hạn (giữ hành vi cũ cho các loại push khác).
    const canGetOwned = (email: string): boolean => {
      if (!ownerEmail) return true;
      const role = (email ? permByEmail[email] : null)?.role;
      if (role === "ketoan" || role === "giamdoc") return true;
      return !!email && email === ownerEmail;
    };

    const payload = JSON.stringify({ title, body, tag, url });
    let sent = 0, removed = 0, skipped = 0;

    await Promise.all((subs ?? []).map(async (row: any) => {
      if (excludeEndpoint && row.endpoint === excludeEndpoint) return;
      const em = row.email || "";
      if (!wantsTab(em) || !canGetOwned(em)) { skipped++; return; }
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
          removed++;
        } else {
          console.error("push error", row.endpoint, e?.statusCode, e?.body);
        }
      }
    }));

    return json({ ok: true, sent, removed, skipped });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 400);
  }
});
