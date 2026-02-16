# Project Scope: WebFiles

## Overview
WebFiles is a web-based file management application that enables users to upload, browse, search, organize, share, and manage files in the browser. It emphasizes secure storage, robust sharing, responsive performance, and a clean, accessible UI.

## Objectives & Success Metrics
- Fast uploads and responsive browsing/search.
- Secure sharing with permissions and expiring signed URLs.
- Good UX on desktop and mobile using Tailwind CSS.
- Seamless integration with Node.js, Supabase (Auth, Postgres, Storage), and React.
- Metrics: uploads/user, sessions/user, share links created, retention, average time to upload/find, uptime, error rate.

## In Scope (Phase 1)
- User authentication and basic profile management.
- File upload/download with metadata.
- File browsing, sorting, filtering, and search by filename/tags.
- Core management operations: rename, move, delete, download, bulk actions.
- Share links with options (public/restricted/password/expiry) and basic permissions (read-only).
- Storage via Supabase Storage, metadata in Postgres, signed URLs for access.
- Responsive UI with Tailwind; drag-and-drop upload; basic previews for images/PDF/video/audio.

## Out of Scope (Phase 1)
- Offline sync and device-wide editing.
- Full-text content search.
- Native mobile apps.
- Real-time collaboration.
- External storage connectors and advanced analytics.

## Technology Stack
- Frontend: Next.js (App Router) + React + Tailwind CSS + shadcn/ui.
- Backend/API: Node.js (Express or Fastify).
- Database & Auth: Supabase (PostgreSQL, Auth, Row-Level Security).
- File Storage: Supabase Storage (S3-compatible).
- CI/CD: GitHub Actions; Deployment via Docker or preferred MCP environment.
- Testing: Jest (backend), React Testing Library (frontend), Cypress (E2E).

## Architecture Summary
- Frontend communicates with backend API for auth, metadata, and signed URLs.
- Backend validates permissions via Supabase Auth/DB, issues signed upload/download URLs, and records file metadata.
- Share links stored in DB with tokens, expiry, and options; public route resolves token to access.

## Data Model (Simplified)
- users: id, email, name, created_at, role.
- files: id, owner_user_id, filename, size, mime_type, storage_path, folder_id, tags[], upload_date, version_number, is_deleted, deleted_at.
- folders: id, owner_user_id, name, parent_folder_id, created_at.
- share_links: id, file_or_folder_id, is_folder, token, created_by_user_id, created_at, expiry_date, permission_type.
- file_versions (future): id, file_id, version_number, storage_path, uploaded_at.

## Security & Permissions
- Enforce RLS: owners and permitted users only.
- Share links: token-based, expiry checks, optional password.
- Signed URLs: short-lived; HTTPS everywhere.
- All endpoints authenticated except public share link access.

## UX/UI Overview
- Login/Signup; Dashboard with folder sidebar and file list/grid; search and sort.
- Upload modal/drag-and-drop with progress.
- File preview modal with share controls.
- Profile settings with basic info and storage usage.

## Deliverables (Phase 1)
- Working auth flow.
- Upload and download with signed URLs and metadata persistence.
- Browsing, search, and core file operations.
- Share link generation and access.
- Responsive UI and basic previews.

## Risks & Mitigations
- Large uploads: chunking, size limits, quotas.
- Share link exposure: short expiries, optional password, rate-limiting.
- UI performance: pagination, lazy loading, DB indexing.
- Backup/DR: scheduled backups, off-site replication.

## Assumptions & Open Questions
- Assumptions: stable internet; acceptable storage costs; Supabase sufficient for phase 1.
- Open questions: collaboration timing; max file size; per-user quotas; branding and design; mobile vs desktop priority; offline sync timing; versioning phase.

## Milestones (Sprints)
- Sprint 1: Project skeleton (frontend + backend), auth, basic upload UI/API.
- Sprint 2: File listing/browsing endpoints, sorting/filtering.
- Sprint 3: Upload completion flow, preview/download.
- Sprint 4: Share link generation/access, basic folder management.
- Sprint 5: UI polish, responsive design, performance, QA.
- Sprint 6: Deployment, monitoring, feedback, fixes.
- Phase 2: Versioning, collaboration, connectors, analytics, offline, mobile.

## Ordered Task List
1) Environment Setup (completed)
   - Next.js app scaffold with TypeScript (`webfiles`).
   - Tailwind CSS configured (v4) and ESLint.
   - shadcn/ui initialized; utilities added.
   - Supabase client installed; production build verified.

2) Backend Foundation
   - Initialize Node.js API project; configure `.env`.
   - Integrate Supabase Auth verification middleware.
   - Define REST endpoints: `/files`, `/files/upload-init`, `/files/:id/download`, `/shares`, `/s/:token`, `/folders`.
   - Create Supabase tables (users, files, folders, share_links) and RLS policies.

3) Frontend Foundation
   - Set up routes: `/login`, `/dashboard`, `/profile`.
   - Implement auth context and Supabase client wiring.
   - Build upload UI with drag-and-drop and progress.
   - Implement file list/grid with sorting/filtering and search.
   - Add preview modal and download via signed URL.
   - Implement share link dialog and public share page.
   - Folder tree and basic move/rename/delete operations.

4) Quality & Delivery
   - Unit tests (backend/frontend) and E2E (login → upload → share → download).
   - Dockerize, set up CI/CD, configure deployment and monitoring.
   - Backup strategy for DB and storage.

## Current Status
- Completed: Next.js scaffold, Tailwind CSS, ESLint, shadcn/ui initialization, Supabase client installation, production build verification.
- Next Recommended Actions: Initialize backend API and Supabase schema; set up auth context and core routes; begin upload/listing workflows.