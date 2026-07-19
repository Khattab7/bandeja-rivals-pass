-- Track when a user taps a push notification banner
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
