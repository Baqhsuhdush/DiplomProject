$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
Write-Host "Stopping stack..."
docker compose down
Write-Host "Starting stack (build if needed)..."
docker compose up -d --build
Write-Host "Done. Health: http://localhost:8000/health"
