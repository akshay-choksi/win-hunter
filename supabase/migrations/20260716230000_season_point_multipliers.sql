-- Reclassify known Signature / Major events by name, then set season-point multipliers.
-- standard=1.0, signature=1.5, major=2.0

-- Majors
UPDATE public.tournaments
SET event_type = 'major'
WHERE lower(name) LIKE '%masters%'
   OR lower(name) LIKE '%u.s. open%'
   OR lower(name) LIKE '%us open%'
   OR lower(name) LIKE '%open championship%'
   OR lower(name) LIKE '%the open%'
   OR lower(name) LIKE '%pga championship%';

-- Signature (PGA Signature events + Players)
UPDATE public.tournaments
SET event_type = 'signature'
WHERE event_type IS DISTINCT FROM 'major'
  AND (
    lower(name) LIKE '%signature%'
    OR lower(name) LIKE '%players championship%'
    OR lower(name) LIKE '%the players%'
    OR lower(name) LIKE '%sentry%'
    OR lower(name) LIKE '%pebble beach%'
    OR lower(name) LIKE '%genesis invitational%'
    OR lower(name) LIKE '%arnold palmer%'
    OR lower(name) LIKE '%memorial%'
    OR lower(name) LIKE '%rbc heritage%'
    OR lower(name) LIKE '%travelers%'
  );

UPDATE public.tournaments SET fedex_multiplier = 2.0 WHERE event_type = 'major';
UPDATE public.tournaments SET fedex_multiplier = 1.5 WHERE event_type = 'signature';
UPDATE public.tournaments SET fedex_multiplier = 1.0 WHERE event_type = 'standard';
