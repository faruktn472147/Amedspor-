#!/usr/bin/env bash
# Yerel PostgreSQL test sunucusunu başlatır, şema taklidini ve tüm migration'ları uygular.
# Kullanım: bash scripts/db-test-up.sh   (TEST_DATABASE_URL değerini yazdırır)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGTEST_DIR:-/tmp/amedspor-pgtest}"
PORT="${PGTEST_PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then RUN_AS=(runuser -u postgres --); fi

if [ ! -f "$DATA/PG_VERSION" ]; then
  mkdir -p "$DATA"; [ "$(id -u)" = "0" ] && chown postgres "$DATA"
  "${RUN_AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
fi
if ! "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/log.txt" -w start >/dev/null
fi
URL="postgresql://postgres@127.0.0.1:$PORT"
psql "$URL/postgres" -qtAc "drop database if exists amedspor_test with (force)" >/dev/null
psql "$URL/postgres" -qtAc "do \$\$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    drop owned by anon, authenticated, service_role cascade; drop role anon; drop role authenticated; drop role service_role;
  end if; end \$\$" >/dev/null 2>&1 || true
psql "$URL/postgres" -qtAc "create database amedspor_test" >/dev/null
psql "$URL/amedspor_test" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$URL/amedspor_test" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
echo "$URL/amedspor_test"
