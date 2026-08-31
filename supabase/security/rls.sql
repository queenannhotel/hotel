-- =====================================================================
-- Queen Ann Hotel — Row Level Security (RLS) cho Supabase
-- Dán TOÀN BỘ file này vào: Supabase Dashboard -> SQL Editor -> Run.
-- Sau khi chạy: người NGOÀI (không đăng nhập) KHÔNG còn đọc/ghi được dữ liệu
-- dù có khoá công khai; người đăng nhập chỉ ghi được nhóm dữ liệu đúng vai trò.
--
-- ⚠️ QUAN TRỌNG: TEST theo TỪNG vai trò sau khi chạy (xem phần cuối file).
--    Vai trò lấy từ JWT app_metadata.role (đặt tại Authentication -> Users -> user -> App metadata:
--    {"role":"giamdoc"} | "ketoan" | "hr" | "truong-bp"). Thiếu role => bị chặn ghi (đúng ý).
-- =====================================================================

-- ---------- Helpers: đọc vai trò & email từ JWT ----------
create or replace function public.qah_role() returns text
  language sql stable as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'role','') $$;

create or replace function public.qah_email() returns text
  language sql stable as $$ select auth.jwt() ->> 'email' $$;

-- ---------- Ai được GHI collection nào (khớp WRITE_MATRIX + cấp tab tuỳ biến trong app) ----------
create or replace function public.qah_can_write(coll text) returns boolean
  language sql stable as $$
  select
    coalesce(public.qah_role() = 'giamdoc', false)
    or coll = any( case public.qah_role()
        when 'ketoan'    then array['thu','chi','ncc','catalog','dvtList','dx','kho','khoDeleted','yc','ycDeleted','transferReq','quyTx','quyUng','hkStaff','mbHistory','hvNono','mbItemMap']
        when 'hr'        then array['nsLuong','bhxh','tncn','dx','kho','khoDeleted','yc','ycDeleted','transferReq']
        when 'truong-bp' then array['dx','kho','khoDeleted','yc','ycDeleted','transferReq','wsData','roomStatus','amData','mbData','hvLinen','hvRewash','hvCols','sx','hkStaff','mbHistory','hvNono','mbItemMap']
        else array[]::text[] end )
    -- Cấp tab tuỳ biến (user_perms.tabs) → cho ghi nhóm gắn với tab đó (khớp COLLECTION_TAB trong app)
    -- user_perms.tabs lưu JSONB (mảng) → dùng to_jsonb + jsonb_array_elements_text (an toàn với jsonb/json/text[]).
    or exists (
        select 1 from public.user_perms up
        where up.email = public.qah_email() and jsonb_typeof(to_jsonb(up.tabs)) = 'array'
          and (case coll
                when 'thu' then 'tab-thu' when 'chi' then 'tab-chi' when 'ncc' then 'nha-cung-cap'
                when 'catalog' then 'danh-muc' when 'dvtList' then 'danh-muc'
                when 'nsLuong' then 'nhan-su' when 'bhxh' then 'nhan-su' when 'tncn' then 'nhan-su'
                when 'dx' then 'de-xuat' when 'kho' then 'kho' when 'khoDeleted' then 'kho'
                when 'transferReq' then 'yeu-cau-transfer' when 'quyTx' then 'quy-tien-mat' when 'quyUng' then 'quy-tien-mat'
                when 'yc' then 'buong-phong' when 'ycDeleted' then 'buong-phong' when 'wsData' then 'buong-phong'
                when 'roomStatus' then 'buong-phong' when 'hkStaff' then 'buong-phong' when 'mbHistory' then 'buong-phong'
                when 'mbItemMap' then 'buong-phong' when 'hvNono' then 'buong-phong' when 'amData' then 'buong-phong'
                when 'mbData' then 'buong-phong' when 'hvLinen' then 'buong-phong' when 'hvRewash' then 'buong-phong'
                when 'hvCols' then 'buong-phong' when 'sx' then 'buong-phong'
                else null end)
              in (select jsonb_array_elements_text(to_jsonb(up.tabs)))
      );
$$;

-- =====================================================================
-- BẢNG records — toàn bộ dữ liệu nghiệp vụ
-- SELECT: mọi user ĐĂNG NHẬP đọc (app kéo toàn bộ). ANON bị chặn (to authenticated).
-- Ghi/sửa/xoá: đúng vai trò theo qah_can_write(collection).
-- =====================================================================
alter table public.records enable row level security;
drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
drop policy if exists records_delete on public.records;
create policy records_select on public.records for select to authenticated using (true);
create policy records_insert on public.records for insert to authenticated with check (public.qah_can_write(collection));
create policy records_update on public.records for update to authenticated using (public.qah_can_write(collection)) with check (public.qah_can_write(collection));
create policy records_delete on public.records for delete to authenticated using (public.qah_can_write(collection));

-- =====================================================================
-- BẢNG user_perms — email + vai trò + phân quyền tab
-- SELECT: xem dòng của MÌNH; Giám đốc xem tất cả.
-- INSERT: tự tạo dòng của mình (lần đăng nhập đầu). UPDATE: chỉ Giám đốc.
-- =====================================================================
alter table public.user_perms enable row level security;
drop policy if exists up_select on public.user_perms;
drop policy if exists up_insert on public.user_perms;
drop policy if exists up_update on public.user_perms;
create policy up_select on public.user_perms for select to authenticated
  using (email = public.qah_email() or public.qah_role() = 'giamdoc');
create policy up_insert on public.user_perms for insert to authenticated
  with check (email = public.qah_email());
create policy up_update on public.user_perms for update to authenticated
  using (public.qah_role() = 'giamdoc') with check (public.qah_role() = 'giamdoc');

-- =====================================================================
-- BẢNG push_subscriptions — mỗi user chỉ ghi đăng ký của chính mình.
-- (Edge Function 'send-push' dùng service_role nên tự đọc được, không cần policy SELECT cho client.)
-- =====================================================================
alter table public.push_subscriptions enable row level security;
drop policy if exists ps_insert on public.push_subscriptions;
drop policy if exists ps_update on public.push_subscriptions;
create policy ps_insert on public.push_subscriptions for insert to authenticated with check (email = public.qah_email());
create policy ps_update on public.push_subscriptions for update to authenticated using (email = public.qah_email()) with check (email = public.qah_email());

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY
-- 1) Bật RLS chưa:  select tablename, rowsecurity from pg_tables where schemaname='public';
-- 2) Xem policy:    select * from pg_policies where schemaname='public';
-- 3) Test "người ngoài" (trình duyệt ẩn danh, CHƯA đăng nhập, Console F12):
--    fetch('https://<PROJECT>.supabase.co/rest/v1/records?select=collection&limit=1',
--      {headers:{apikey:'<ANON_PUBLISHABLE_KEY>'}}).then(r=>r.json()).then(console.log)
--    → phải trả [] hoặc lỗi quyền (KHÔNG ra dữ liệu).
-- 4) Test theo vai trò: đăng nhập lần lượt từng vai trò trong app, thử tạo/sửa/xoá ở
--    các tab được phép và KHÔNG được phép. Nếu 1 thao tác HỢP LỆ bị chặn → kiểm app_metadata.role
--    của user đó, hoặc bổ sung collection vào mảng vai trò trong hàm qah_can_write ở trên.
-- =====================================================================
