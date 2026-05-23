#!/usr/bin/env bash
# Regenerate lib/supabase/types.ts from the live Supabase project schema.
# Requires the `supabase` CLI logged in (or SUPABASE_ACCESS_TOKEN env var).
# Project: ybabwpbxckqggjxnueeh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ybabwpbxckqggjxnueeh}"
OUT="lib/supabase/types.ts"

echo "→ Generating types for project $PROJECT_ID …"

npx --yes supabase@latest gen types typescript \
  --project-id "$PROJECT_ID" \
  --schema public \
  > "$OUT.tmp"

# Prepend a "do not edit" banner.
{
  cat <<'EOF'
// =========================================================================
// AUTO-GENERATED. Do not edit by hand.
// Regenerate via: `pnpm db:types`
// =========================================================================
EOF
  cat "$OUT.tmp"
} > "$OUT"

rm "$OUT.tmp"
echo "→ Wrote $OUT"
