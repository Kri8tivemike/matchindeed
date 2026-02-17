## Phase 5: Host & Admin Management System - Implementation Guide

### Overview
This phase implements the complete Host Management System with database schema, API endpoints, and UI components for host meeting management and earnings tracking.

### Status
**Completed:** Database Migration (006_create_host_system.sql)
**Pending:** Frontend Components & API Routes

---

## Part 1: Database Migration ✓

### File: migrations/006_create_host_system.sql
- Location: `/home/matchindeed/htdocs/matchindeed.com/migrations/006_create_host_system.sql`
- Size: 5572 bytes | Lines: 159
- Status: READY FOR DEPLOYMENT

### Tables Created

#### 1. host_profiles
\`\`\`sql
CREATE TABLE host_profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id),
  host_type TEXT CHECK (IN 'basic', 'premium', 'vip'),
  commission_rate DECIMAL(5, 2) DEFAULT 10.00,
  is_active BOOLEAN DEFAULT true,
  two_fa_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
\`\`\`

#### 2. host_meetings
\`\`\`sql
CREATE TABLE host_meetings (
  id UUID PRIMARY KEY,
  host_id UUID REFERENCES host_profiles(id),
  meeting_id UUID REFERENCES meetings(id),
  report_submitted BOOLEAN DEFAULT false,
  success_marked BOOLEAN,
  notes TEXT,
  video_recording_url TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(host_id, meeting_id)
);
\`\`\`

#### 3. host_earnings
\`\`\`sql
CREATE TABLE host_earnings (
  id UUID PRIMARY KEY,
  host_id UUID REFERENCES host_profiles(id),
  meeting_id UUID REFERENCES meetings(id),
  amount DECIMAL(10, 2),
  status TEXT CHECK (IN 'pending', 'processing', 'paid', 'failed'),
  paid_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(host_id, meeting_id)
);
\`\`\`

### Security Features
- RLS (Row Level Security) policies for all tables
- Users can only see their own data
- Admin-only write permissions
- Indexes on frequently queried columns
- Automatic timestamp updates via triggers

---

## Part 2: Frontend Implementation

### 2.1 Host Dashboard - src/app/host/dashboard/page.tsx

**Requirements:**
- Authentication check (redirect to login if not authenticated)
- Host status verification (check if user has host profile)
- Display host type and tier
- Statistics display:
  - Total meetings
  - Success rate percentage
  - Pending reports count
  - Total earnings
- Earnings summary:
  - Pending payout amount
  - Already paid amount
- Meetings list:
  - Show assigned meetings
  - Display report status
  - Button to submit report
- Modal for meeting report submission

**Key Props/State:**
\`\`\`typescript
interface HostProfile {
  id: string;
  user_id: string;
  host_type: 'basic' | 'premium' | 'vip';
  commission_rate: number;
  is_active: boolean;
  two_fa_enabled: boolean;
  created_at: string;
}

interface HostMeeting {
  id: string;
  host_id: string;
  meeting_id: string;
  report_submitted: boolean;
  success_marked: boolean | null;
  notes: string | null;
  video_recording_url: string | null;
  created_at: string;
}
\`\`\`

### 2.2 Meeting Report Form Component - src/components/host/meeting-report-form.tsx

**Features:**
- Radio buttons for Success/Denied
- Notes textarea (optional)
- Video upload input (VIP meetings only)
- Form validation
- Submit and Cancel buttons
- Loading state during submission
- Error handling with user feedback

**Props:**
\`\`\`typescript
interface MeetingReportFormProps {
  meeting: HostMeeting;
  onSuccess: () => void;
  onCancel: () => void;
}
\`\`\`

---

## Part 3: API Routes

### 3.1 Meetings API - src/app/api/host/meetings/route.ts

**GET Request:**
- Fetch host's assigned meetings
- Return meetings with report status
- Sort by created_at DESC

**Request Headers:**
\`\`\`
Authorization: Bearer {token}
Content-Type: application/json
\`\`\`

**Response Example:**
\`\`\`json
{
  "meetings": [
    {
      "id": "uuid",
      "meeting_id": "uuid",
      "report_submitted": false,
      "success_marked": null
    }
  ]
}
\`\`\`

**POST Request:**
- Update meeting report status
- Mark meeting as success/denied
- Add optional notes

**POST Body:**
\`\`\`json
{
  "meeting_id": "uuid",
  "success_marked": true,
  "notes": "Optional meeting notes"
}
\`\`\`

### 3.2 Detailed Report API - src/app/api/host/report/route.ts

**POST Request:**
- Submit detailed meeting report
- Handle video upload for VIP meetings
- Validate video file type and size

**Request Body:**
\`\`\`json
{
  "meeting_id": "uuid",
  "success_marked": true,
  "notes": "Detailed meeting report",
  "video_url": "https://..."
}
\`\`\`

---

## Deployment Instructions

### Step 1: Database Migration
\`\`\`bash
cd /home/matchindeed/htdocs/matchindeed.com
psql -U postgres -h localhost < migrations/006_create_host_system.sql
\`\`\`

### Step 2: Create TypeScript Files
Create the following files with appropriate implementations:
1. src/app/host/dashboard/page.tsx
2. src/app/api/host/meetings/route.ts
3. src/app/api/host/report/route.ts
4. src/components/host/meeting-report-form.tsx

### Step 3: Environment Configuration
Ensure the following environment variables are set:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

### Step 4: Build & Deploy
\`\`\`bash
npm run build
npm run deploy
\`\`\`

---

## Testing Checklist

### Database Tests
- [ ] Tables created successfully
- [ ] RLS policies applied
- [ ] Indexes created
- [ ] Triggers working

### API Tests
- [ ] GET /api/host/meetings returns meetings
- [ ] POST /api/host/meetings updates report status
- [ ] POST /api/host/report submits detailed report
- [ ] Authentication required for all endpoints
- [ ] Only own data visible due to RLS

### UI Tests
- [ ] Dashboard loads with host profile
- [ ] Statistics calculated correctly
- [ ] Meetings displayed in list
- [ ] Report form modal opens/closes
- [ ] Form validation works
- [ ] Report submission successful
- [ ] Redirect to login if not authenticated

---

## Notes
- Migration is database-agnostic (works with PostgreSQL)
- All APIs require authentication via JWT
- Video uploads should be processed asynchronously
- Consider implementing queue system for payment processing
- Add audit logging for all host activities
