-- Normalize and backfill partner gender preference for legacy rows.
-- Priority:
-- 1) explicit partner_gender_preference (including old textual variants),
-- 2) legacy partner_experience textual variants,
-- 3) fallback to opposite binary gender from user_profiles for rows still unset.

with resolved as (
  select
    up.user_id,
    case
      when lower(trim(coalesce(up.partner_gender_preference, ''))) in ('male', 'man') then 'male'
      when lower(trim(coalesce(up.partner_gender_preference, ''))) in ('female', 'woman') then 'female'
      when lower(trim(coalesce(up.partner_gender_preference, ''))) in (
        'i''m a man seeking a woman',
        'im a man seeking a woman',
        'man seeking woman',
        'man-woman',
        'man_seeking_woman'
      ) then 'female'
      when lower(trim(coalesce(up.partner_gender_preference, ''))) in (
        'i''m a woman seeking a man',
        'im a woman seeking a man',
        'woman seeking man',
        'woman-man',
        'woman_seeking_man'
      ) then 'male'
      when lower(trim(coalesce(up.partner_gender_preference, ''))) in (
        'i''m a man seeking a man',
        'im a man seeking a man',
        'man seeking man',
        'man-man',
        'man_seeking_man'
      ) then 'male'
      when lower(trim(coalesce(up.partner_gender_preference, ''))) in (
        'i''m a woman seeking a woman',
        'im a woman seeking a woman',
        'woman seeking woman',
        'woman-woman',
        'woman_seeking_woman'
      ) then 'female'

      when lower(trim(coalesce(up.partner_experience, ''))) in ('male', 'man') then 'male'
      when lower(trim(coalesce(up.partner_experience, ''))) in ('female', 'woman') then 'female'
      when lower(trim(coalesce(up.partner_experience, ''))) in (
        'i''m a man seeking a woman',
        'im a man seeking a woman',
        'man seeking woman',
        'man-woman',
        'man_seeking_woman'
      ) then 'female'
      when lower(trim(coalesce(up.partner_experience, ''))) in (
        'i''m a woman seeking a man',
        'im a woman seeking a man',
        'woman seeking man',
        'woman-man',
        'woman_seeking_man'
      ) then 'male'
      when lower(trim(coalesce(up.partner_experience, ''))) in (
        'i''m a man seeking a man',
        'im a man seeking a man',
        'man seeking man',
        'man-man',
        'man_seeking_man'
      ) then 'male'
      when lower(trim(coalesce(up.partner_experience, ''))) in (
        'i''m a woman seeking a woman',
        'im a woman seeking a woman',
        'woman seeking woman',
        'woman-woman',
        'woman_seeking_woman'
      ) then 'female'

      when lower(coalesce(upf.gender, '')) = 'male' then 'female'
      when lower(coalesce(upf.gender, '')) = 'female' then 'male'
      else null
    end as resolved_preference
  from user_preferences up
  left join user_profiles upf on upf.user_id = up.user_id
)
update user_preferences up
set partner_gender_preference = r.resolved_preference
from resolved r
where up.user_id = r.user_id
  and r.resolved_preference is not null
  and coalesce(up.partner_gender_preference, '') <> r.resolved_preference;
