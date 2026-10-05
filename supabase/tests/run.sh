#!/bin/sh
# Prueba el esquema en un PostgreSQL local: sh supabase/tests/run.sh   (requiere PGHOST/PGPORT/PGUSER o los valores de abajo)
set -e
H="${PGHOST:-/tmp}"; P="${PGPORT:-54329}"; U="${PGUSER:-postgres}"; D=oli_test
export PGOPTIONS="-c client_min_messages=notice"
cd "$(dirname "$0")"
psql -h $H -p $P -U $U -q -c "drop database if exists $D" -c "create database $D"
psql -h $H -p $P -U $U -d $D -v ON_ERROR_STOP=1 -q -f 00_supabase_stub.sql
for f in ../migrations/*.sql; do psql -h $H -p $P -U $U -d $D -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -h $H -p $P -U $U -d $D -v ON_ERROR_STOP=1 -f 10_oli_tests.sql
