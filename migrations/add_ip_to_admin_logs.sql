-- Add IP address column to admin_logs for audit trail
-- Run in Supabase SQL Editor

ALTER TABLE admin_logs
ADD COLUMN IF NOT EXISTS ip_address TEXT;

COMMENT ON COLUMN admin_logs.ip_address IS 'Client IP address when action was performed';
