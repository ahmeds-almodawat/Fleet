-- Add image_url column to vehicles table for car pictures
ALTER TABLE public.vehicles ADD COLUMN image_url TEXT;

-- Add image storage bucket for vehicle photos
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-images', 'vehicle-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for vehicle images
CREATE POLICY "Authenticated can upload vehicle images" ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'vehicle-images');
CREATE POLICY "Authenticated can view vehicle images" ON storage.objects FOR SELECT TO authenticated 
  USING (bucket_id = 'vehicle-images');
CREATE POLICY "Authenticated can update vehicle images" ON storage.objects FOR UPDATE TO authenticated 
  USING (bucket_id = 'vehicle-images');
CREATE POLICY "Authenticated can delete vehicle images" ON storage.objects FOR DELETE TO authenticated 
  USING (bucket_id = 'vehicle-images');