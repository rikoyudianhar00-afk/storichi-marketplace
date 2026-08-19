-- ============================================================
-- STORICHI MARKETPLACE — Schema v4
-- Upload gambar/video untuk chat & rekber
-- ============================================================

alter table chat_messages add column if not exists attachment_url text;
alter table chat_messages add column if not exists attachment_type text; -- 'image' | 'video'

alter table rekber_messages add column if not exists attachment_url text;
alter table rekber_messages add column if not exists attachment_type text;

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Siapa saja bisa lihat lampiran chat" on storage.objects;
create policy "Siapa saja bisa lihat lampiran chat"
  on storage.objects for select
  using (bucket_id = 'chat-attachments');

drop policy if exists "User login bisa upload lampiran chat" on storage.objects;
create policy "User login bisa upload lampiran chat"
  on storage.objects for insert
  with check (bucket_id = 'chat-attachments' and auth.role() = 'authenticated');
