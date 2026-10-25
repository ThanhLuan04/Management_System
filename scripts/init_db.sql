-- Create the SmartStore login role and the dev/test databases. Safe to run again.
-- Variables are passed by scripts/init_db.ps1: app_user, app_password, db_name, test_db_name

SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

-- Always (re)set the password so it matches backend/.env
ALTER ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';

SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'db_name', :'app_user', 'UTF8')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec

SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', :'test_db_name', :'app_user', 'UTF8')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'test_db_name') \gexec

SELECT datname AS database, pg_get_userbyid(datdba) AS owner, pg_encoding_to_char(encoding) AS encoding
FROM pg_database WHERE datname IN (:'db_name', :'test_db_name') ORDER BY datname;
