$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

if (-not (Test-Path $backendDir)) {
  throw "Backend directory not found: $backendDir"
}

if (-not (Test-Path $frontendDir)) {
  throw "Frontend directory not found: $frontendDir"
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "Starting PostgreSQL and Redis with Docker Compose..."
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$root'; docker compose up -d db redis"
  )
} else {
  Write-Host "Docker not found. Ensure PostgreSQL is running on localhost:5432 (user/password: qadam/qadam)." -ForegroundColor Yellow
}

Write-Host "Starting backend in a new terminal window..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$backendDir'; py -m uvicorn app.main:app --reload --port 8001"
)

Write-Host "Starting frontend in a new terminal window..."
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$frontendDir'; npm run dev"
)

Write-Host "Done. Backend: http://127.0.0.1:8001, Frontend: http://127.0.0.1:3001 (or 3000)."
