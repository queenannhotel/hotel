# Lịch làm phòng (Housekeeping) — hướng dẫn

Trang `lich-lam-phong.html` là công cụ **tự xếp thứ tự & chia giờ làm phòng** cho bộ phận
Housekeeping, được nhúng vào app chính (`Index.html`) dưới tab **“Lịch làm phòng”**.

## Cách hoạt động
- Là 1 file HTML độc lập, nhúng bằng `<iframe>` nên **không đụng gì tới CSS/JS của app kế toán**.
- **Đồng bộ đa thiết bị** dùng chung project Supabase với app chính:
  lưu vào bảng `records`, collection = **`hkLich`**, mỗi ngày một dòng (`id` = ngày `YYYY-MM-DD`,
  `data` = `{params, rooms}`), có realtime nên máy khác thấy thay đổi sau vài giây.
- Vì cùng origin (GitHub Pages) nên iframe **dùng lại phiên đăng nhập** của app chính — không cần đăng nhập lại.
- App kế toán bỏ qua collection `hkLich` (không nằm trong registry của nó) nên hai bên không xung đột.

## Cần làm 1 lần trên Supabase (RLS)
Bảng `records` đang có RLS theo vai trò. Cần cho phép **giamdoc / truong-bp** ghi collection `hkLich`.
Nếu policy hiện tại đã cho “authenticated ghi mọi collection” thì chạy được ngay. Nếu chặn theo
collection, thêm policy (ví dụ — chỉnh tên cột vai trò cho khớp schema thực tế):

```sql
-- Cho phép đọc (nếu chưa có policy đọc chung)
create policy "hkLich read"  on public.records for select
  using ( collection = 'hkLich' );

-- Cho phép ghi/sửa với vai trò giamdoc, truong-bp
create policy "hkLich write" on public.records for insert
  with check ( collection = 'hkLich' and auth.jwt() ->> 'role' in ('giamdoc','truong-bp') );
create policy "hkLich update" on public.records for update
  using ( collection = 'hkLich' and auth.jwt() ->> 'role' in ('giamdoc','truong-bp') );
```

> Nếu app đang lấy vai trò từ bảng `profiles` chứ không phải JWT claim, hãy dùng đúng cách
> kiểm tra vai trò mà các policy `records` khác đang dùng.

## Kiểm tra
1. Mở app trên GitHub Pages, đăng nhập.
2. Vào tab **Lịch làm phòng** → góc phải thanh ngày hiện chấm **“Đã đồng bộ”** (xanh).
3. Sửa 1 giờ check-out → mở trên máy khác cùng ngày → thấy cập nhật.
4. Nếu chấm báo **“Mất kết nối”**: mở Console xem lỗi (thường là RLS chặn ghi) và chỉnh policy như trên.
