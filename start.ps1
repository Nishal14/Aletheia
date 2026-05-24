# Aletheia — single-command launcher (Windows)
# Usage: .\start.ps1

$Root     = $PSScriptRoot
$Backend  = "$Root\backend"
$Frontend = "$Root\frontend"

function ok   { Write-Host "  [OK] $args" -ForegroundColor Green }
function warn { Write-Host "  [!]  $args" -ForegroundColor Yellow }
function err  { Write-Host "  [X]  $args" -ForegroundColor Red }
function info { Write-Host "  -->  $args" -ForegroundColor Cyan }

Write-Host ""
Write-Host "  Aletheia Launcher" -ForegroundColor Cyan
Write-Host ""

# ── 1. uv ────────────────────────────────────────────────────────────────────
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    warn "uv not found — installing..."
    powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
    $env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
}
$uvVer = (uv --version) -split ' ' | Select-Object -Last 1
ok "uv $uvVer"

# ── 2. Backend deps (uv sync) ────────────────────────────────────────────────
info "Syncing backend dependencies..."
Set-Location $Backend
uv sync --quiet
ok "Backend deps ready"

# ── 3. .env ──────────────────────────────────────────────────────────────────
if (-not (Test-Path "$Backend\.env")) {
    Copy-Item "$Backend\.env.example" "$Backend\.env"
    ok "Created backend/.env"
}

# ── 4. Frontend deps ─────────────────────────────────────────────────────────
Set-Location $Frontend
if (-not (Test-Path "$Frontend\node_modules")) {
    info "Installing frontend dependencies..."
    npm install --silent
    ok "Frontend deps ready"
} else {
    ok "Frontend deps already installed"
}

# ── 5. Ollama models ─────────────────────────────────────────────────────────
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    err "Ollama not found. Install from https://ollama.ai then re-run."
    exit 1
}

$installed = ollama list 2>$null
foreach ($model in @("qwen3:4b", "nomic-embed-text")) {
    if ($installed -match [regex]::Escape($model)) {
        ok "Model: $model"
    } else {
        info "Pulling $model..."
        ollama pull $model
        ok "Model: $model"
    }
}

# ── 6. Qdrant ────────────────────────────────────────────────────────────────
Set-Location $Root
if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
        docker compose up qdrant -d --quiet-pull 2>$null | Out-Null
        ok "Qdrant started"
    } catch {
        warn "Qdrant failed to start (chat still works without it)"
    }
} else {
    warn "Docker not available — Qdrant skipped"
}

# ── 7. Launch ────────────────────────────────────────────────────────────────
Write-Host ""
info "Starting backend..."
$backendJob = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Backend'; uv run uvicorn app.main:app --port 8000"
) -PassThru -WindowStyle Normal

Start-Sleep -Seconds 2

info "Starting frontend..."
$frontendJob = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$Frontend'; npm run dev"
) -PassThru -WindowStyle Normal

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "  Aletheia is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend  ->  http://localhost:3000"
Write-Host "  Backend   ->  http://localhost:8000"
Write-Host "  API docs  ->  http://localhost:8000/docs"
Write-Host ""
Write-Host "  Close the terminal windows to stop."
Write-Host ""
