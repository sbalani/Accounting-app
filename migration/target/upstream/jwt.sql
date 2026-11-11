-- Verbatim from docker/volumes/db/jwt.sql at Supabase upstream
-- 86f9c0c2506c8276a03410d99f3185b8bd67d0e9 (apart from these comments).
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
