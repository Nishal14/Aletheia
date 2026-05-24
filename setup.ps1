# Aletheia - First-time Setup Script
Write-Host "`n=== Aletheia Setup ===" -ForegroundColor Cyan

# Backend deps
Write-Host "`n[1/4] Installing Python dependencies..." -ForegroundColor Green
Set-Location "$PSScriptRoot\backend"
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: pip install failed" -ForegroundColor Red; exit 1 }

# Frontend deps
Write-Host "`n[2/4] Installing Node.js dependencies..." -ForegroundColor Green
Set-Location "$PSScriptRoot\frontend"
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: npm install failed" -ForegroundColor Red; exit 1 }

Set-Location $PSScriptRoot

# Ollama models
Write-Host "`n[3/4] Pulling Ollama models..." -ForegroundColor Green
$models = @("qwen3:4b", "nomic-embed-text")
foreach ($model in $models) {
    Write-Host "  Pulling $model..." -ForegroundColor DarkGray
    ollama pull $model
}

# Optional: phi4-mini for verification
Write-Host "`n[4/4] Optional: Pull phi4-mini for claim verification?" -ForegroundColor Yellow
$response = Read-Host "Pull phi4-mini? (y/N)"
if ($response -eq "y" -or $response -eq "Y") {
    ollama pull phi4-mini
}

# Copy .env
if (-not (Test-Path "$PSScriptRoot\backend\.env")) {
    Copy-Item "$PSScriptRoot\backend\.env.example" "$PSScriptRoot\backend\.env"
    Write-Host "`n[OK] Created backend/.env from example" -ForegroundColor Green
}

Write-Host "`n=== Setup complete! ===" -ForegroundColor Cyan
Write-Host "Run .\start.ps1 to launch Aletheia" -ForegroundColor White
