-- Phase 2: Calendar System Migration
-- Creates tables for calendar slot allocation and booking management

-- Calendar Slots Table
CREATE TABLE IF NOT EXISTS calendar_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Time Management
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  
  -- Slot Status
  status VARCHAR(50) NOT NULL DEFAULT 'available' CHECK (status IN (
    'available',
    'booked',
    'blocked',
    'maintenance'
  )),
  slot_type VARCHAR(50) NOT NULL DEFAULT 'regular' CHECK (slot_type IN (
    'regular',
    'premium',
    'express',
    'video_only'
  )),
  
  -- Recurrence
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_pattern VARCHAR(50),
  recurrence_end_date TIMESTAMP WITH TIME ZONE,
  
  -- Capacity
  max_bookings INTEGER DEFAULT 1 CHECK (max_bookings >= 1),
  current_bookings INTEGER NOT NULL DEFAULT 0 CHECK (current_bookings >= 0),
  
  -- Location & Meeting Details
  location_type VARCHAR(50) NOT NULL DEFAULT 'virtual' CHECK (location_type IN (
    'virtual',
    'in_person',
    'hybrid'
  )),
  meeting_platform VARCHAR(100),
  location_address TEXT,
  
  -- Preferences
  meeting_topic VARCHAR(200),
  tags TEXT[], -- Array of tags for organization
  notes TEXT,
  
  -- Rules & Constraints
  require_confirmation BOOLEAN DEFAULT TRUE,
  cancellation_deadline_hours INTEGER DEFAULT 24,
  buffer_time_before_minutes INTEGER DEFAULT 15,
  buffer_time_after_minutes INTEGER DEFAULT 15,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT valid_time_range CHECK (start_time < end_time),
  CONSTRAINT valid_duration CHECK (extract(epoch from (end_time - start_time)) / 60 = duration_minutes),
  CONSTRAINT valid_current_bookings CHECK (current_bookings <= max_bookings)
);

CREATE INDEX idx_calendar_slots_user_id ON calendar_slots(user_id);
CREATE INDEX idx_calendar_slots_status ON calendar_slots(status);
CREATE INDEX idx_calendar_slots_start_time ON calendar_slots(start_time);
CREATE INDEX idx_calendar_slots_user_time ON calendar_slots(user_id, start_time);

-- Slot Bookings Table
CREATE TABLE IF NOT EXISTS slot_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES calendar_slots(id) ON DELETE RESTRICT,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  
  -- Booking Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'confirmed',
    'cancelled',
    'no_show',
    'completed',
    'rescheduled'
  )),
  
  -- Response Management
  host_response VARCHAR(50) DEFAULT 'pending' CHECK (host_response IN (
    'pending',
    'accepted',
    'declined',
    'tentative'
  )),
  host_responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Time Details
  booked_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  booked_end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Booking Metadata
  booking_reason TEXT,
  special_requirements TEXT,
  estimated_duration_minutes INTEGER,
  
  -- Cancellation
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason VARCHAR(200),
  cancelled_by UUID REFERENCES auth.users(id),
  
  -- Rescheduling
  rescheduled_from UUID REFERENCES slot_bookings(id),
  rescheduled_at TIMESTAMP WITH TIME ZONE,
  rescheduled_by UUID REFERENCES auth.users(id),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_booking_time CHECK (booked_start_time < booked_end_time),
  CONSTRAINT different_users CHECK (requester_id != host_id)
);

CREATE INDEX idx_slot_bookings_slot_id ON slot_bookings(slot_id);
CREATE INDEX idx_slot_bookings_requester_id ON slot_bookings(requester_id);
CREATE INDEX idx_slot_bookings_host_id ON slot_bookings(host_id);
CREATE INDEX idx_slot_bookings_status ON slot_bookings(status);
CREATE INDEX idx_slot_bookings_meeting_id ON slot_bookings(meeting_id);
CREATE INDEX idx_slot_bookings_booked_time ON slot_bookings(booked_start_time);

-- Calendar Configuration Table
CREATE TABLE IF NOT EXISTS calendar_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Availability Rules
  working_hours_start TIME,
  working_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Default Slot Settings
  default_slot_duration_minutes INTEGER DEFAULT 30 CHECK (default_slot_duration_minutes > 0),
  default_slot_type VARCHAR(50) DEFAULT 'regular',
  default_meeting_location_type VARCHAR(50) DEFAULT 'virtual',
  
  -- Booking Rules
  min_advance_booking_hours INTEGER DEFAULT 1,
  max_advance_booking_days INTEGER DEFAULT 90,
  max_bookings_per_day INTEGER,
  require_host_confirmation BOOLEAN DEFAULT TRUE,
  
  -- Notification Settings
  send_booking_reminders BOOLEAN DEFAULT TRUE,
  reminder_before_minutes INTEGER DEFAULT 60,
  auto_decline_unconfirmed_after_hours INTEGER DEFAULT 24,
  
  -- Preferences
  allow_overlapping_bookings BOOLEAN DEFAULT FALSE,
  allow_cancelled_slot_rebooking BOOLEAN DEFAULT FALSE,
  show_availability_publicly BOOLEAN DEFAULT FALSE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_configurations_user_id ON calendar_configurations(user_id);

-- Calendar Rules Table (for etiquette/meeting guidelines)
CREATE TABLE IF NOT EXISTS calendar_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Rule Type
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN (
    'cancellation_policy',
    'rescheduling_policy',
    'no_show_policy',
    'participation_rules',
    'code_of_conduct'
  )),
  
  -- Rule Details
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  penalty_type VARCHAR(50) CHECK (penalty_type IN (
    'credits',
    'warning',
    'suspension',
    'none'
  )),
  penalty_value INTEGER,
  
  -- Enforcement
  is_active BOOLEAN DEFAULT TRUE,
  applies_to_all BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_rules_user_id ON calendar_rules(user_id);
CREATE INDEX idx_calendar_rules_type ON calendar_rules(rule_type);

-- Add audit trigger function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to calendar_slots
CREATE TRIGGER calendar_slots_update_timestamp
BEFORE UPDATE ON calendar_slots
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Apply trigger to slot_bookings
CREATE TRIGGER slot_bookings_update_timestamp
BEFORE UPDATE ON slot_bookings
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Apply trigger to calendar_configurations
CREATE TRIGGER calendar_configurations_update_timestamp
BEFORE UPDATE ON calendar_configurations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Apply trigger to calendar_rules
CREATE TRIGGER calendar_rules_update_timestamp
BEFORE UPDATE ON calendar_rules
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Enable RLS policies
ALTER TABLE calendar_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar_slots
CREATE POLICY "Users can view their own calendar slots"
  ON calendar_slots FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() IN (
    SELECT requester_id FROM slot_bookings WHERE slot_id = calendar_slots.id
  ));

CREATE POLICY "Users can create their own calendar slots"
  ON calendar_slots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar slots"
  ON calendar_slots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar slots"
  ON calendar_slots FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for slot_bookings
CREATE POLICY "Users can view bookings they are involved in"
  ON slot_bookings FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = host_id);

CREATE POLICY "Users can create slot bookings"
  ON slot_bookings FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update bookings they are involved in"
  ON slot_bookings FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = host_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = host_id);

-- RLS Policies for calendar_configurations
CREATE POLICY "Users can view their own configuration"
  ON calendar_configurations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own configuration"
  ON calendar_configurations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own configuration"
  ON calendar_configurations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for calendar_rules
CREATE POLICY "Users can view their own rules"
  ON calendar_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own rules"
  ON calendar_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rules"
  ON calendar_rules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
