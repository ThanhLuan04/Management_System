# Tao role va database (dev + test) cho SmartStore tu thong tin trong backend/.env.
# Chay lai nhieu lan van an toan. psql se hoi mat khau cua superuser (mac dinh: postgres).
#
#   powershell -ExecutionPolicy Bypass -File scripts\init_db.ps1
#
# File de ASCII de Windows PowerShell 5.1 doc dung ma hoa.

param([string]$Superuser = "postgres")

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\backend\.env"
if (-not (Test-Path $envFile)) {
    throw "Missing backend/.env - copy backend/.env.example to backend/.env first."
}

$vars = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $vars[$Matches[1]] = $Matches[2] }
}

$urlPattern = '^postgresql\+psycopg://([^:]+):([^@]+)@([^:/]+):(\d+)/([^/?]+)$'
if ($vars["DATABASE_URL"] -notmatch $urlPattern) { throw "DATABASE_URL has an unexpected format." }
$appUser = $Matches[1]; $appPassword = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]

if ($vars["TEST_DATABASE_URL"] -notmatch $urlPattern) { throw "TEST_DATABASE_URL has an unexpected format." }
$testDbName = $Matches[5]

Write-Host "Creating role '$appUser' and databases '$dbName', '$testDbName' on ${dbHost}:${dbPort}"

& psql -U $Superuser -h $dbHost -p $dbPort -d postgres -v ON_ERROR_STOP=1 `
    -v "app_user=$appUser" -v "app_password=$appPassword" `
    -v "db_name=$dbName" -v "test_db_name=$testDbName" `
    -f (Join-Path $PSScriptRoot "init_db.sql")

if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE" }
Write-Host "Done."
