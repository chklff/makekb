-- M1.5 — Replace IVFFlat with HNSW on make_scenarios.embedding
-- Rationale: see DECISIONS.md "Vector index: HNSW, not IVFFlat"

DROP INDEX IF EXISTS public.make_scenarios_embedding_idx;

CREATE INDEX make_scenarios_embedding_idx
  ON public.make_scenarios
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
