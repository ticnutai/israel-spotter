
-- Favorites: users can bookmark parcels
CREATE TABLE public.favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  gush integer NOT NULL,
  helka integer NOT NULL,
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, gush, helka)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- Notifications: track plan status changes users subscribe to
CREATE TABLE public.watch_parcels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  gush integer NOT NULL,
  helka integer NOT NULL,
  notify_email boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, gush, helka)
);

ALTER TABLE public.watch_parcels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watches" ON public.watch_parcels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watches" ON public.watch_parcels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watches" ON public.watch_parcels FOR DELETE USING (auth.uid() = user_id);
