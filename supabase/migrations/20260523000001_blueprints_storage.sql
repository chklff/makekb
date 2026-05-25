-- Private Storage bucket for blueprint blobs >500KB (per ingest pipeline).
-- Without this, the ingest pipeline silently falls back to inline JSONB. Pre-creating with
-- the right config:
--   - private (no public URLs ever)
--   - 10 MB file size limit (worst-case real blueprint we've ever seen is ~3 MB)
--   - JSON-only mime type
-- Plus RLS policies that scope reads/writes to service_role only — clients should never
-- talk to Storage directly; if we ever expose a download path, use signed URLs.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blueprints',
  'blueprints',
  false,
  10485760,                -- 10 MB
  ARRAY['application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop any pre-existing policies on this bucket (idempotent re-run safety).
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'blueprints %'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- service_role: full access (the ingest pipeline writes here, future signed-URL endpoint reads).
CREATE POLICY "blueprints service_role all"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'blueprints')
  WITH CHECK (bucket_id = 'blueprints');

-- authenticated / anon: NO access. Clients must go through a server-side endpoint that
-- mints a signed URL. (Not yet built — v1.5 will need this when blueprint preview/download
-- on the Adapt panel is enabled for >500KB scenarios.)
-- Explicitly: no policy for anon or authenticated → no access.
