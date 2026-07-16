-- PGA Tour player number (for headshots) + OWGR from DataGolf field updates
ALTER TABLE public.golfers
  ADD COLUMN IF NOT EXISTS pga_player_num text,
  ADD COLUMN IF NOT EXISTS owgr_rank integer;
