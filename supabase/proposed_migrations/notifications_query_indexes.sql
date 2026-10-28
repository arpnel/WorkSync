-- PREPARED, NOT APPLIED.
-- Supports the notification feed's user-scoped keyset ordering and exact unread count.
-- The live audit confirmed notifications has only its primary-key index.

create index if not exists notifications_user_created_notification_idx
  on public.notifications (user_id, created_at desc, notification_id desc);

create index if not exists notifications_unread_user_idx
  on public.notifications (user_id)
  where is_read = false;
