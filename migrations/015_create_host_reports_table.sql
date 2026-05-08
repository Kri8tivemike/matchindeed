-- Phase 5: Host reporting records
-- Adds missing host_reports table used by /api/host/report.

CREATE TABLE IF NOT EXISTS host_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  guest_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (
    report_type IN (
      'guest_behavior',
      'meeting_issue',
      'payment_problem',
      'technical_issue',
      'safety_concern',
      'other'
    )
  ),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'reviewing', 'resolved', 'dismissed')
  ),
  admin_notes TEXT,
  resolved_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_host_reports_host_id ON host_reports(host_id);
CREATE INDEX IF NOT EXISTS idx_host_reports_meeting_id ON host_reports(meeting_id);
CREATE INDEX IF NOT EXISTS idx_host_reports_status ON host_reports(status);
CREATE INDEX IF NOT EXISTS idx_host_reports_created_at ON host_reports(created_at DESC);

ALTER TABLE host_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hosts can view own reports" ON host_reports;
CREATE POLICY "Hosts can view own reports"
ON host_reports FOR SELECT
USING (
  host_id IN (SELECT id FROM host_profiles WHERE user_id = auth.uid())
  OR auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'moderator')
);

DROP POLICY IF EXISTS "Hosts can create own reports" ON host_reports;
CREATE POLICY "Hosts can create own reports"
ON host_reports FOR INSERT
WITH CHECK (
  host_id IN (SELECT id FROM host_profiles WHERE user_id = auth.uid())
  OR auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'moderator')
);

DROP POLICY IF EXISTS "Admins can update reports" ON host_reports;
CREATE POLICY "Admins can update reports"
ON host_reports FOR UPDATE
USING (auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'moderator'))
WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'moderator'));

GRANT SELECT, INSERT, UPDATE ON host_reports TO authenticated;

CREATE OR REPLACE FUNCTION update_host_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS host_reports_updated_at_trigger ON host_reports;
CREATE TRIGGER host_reports_updated_at_trigger
BEFORE UPDATE ON host_reports
FOR EACH ROW
EXECUTE FUNCTION update_host_reports_updated_at();
