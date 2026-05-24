# Aletheia - Start Script (Windows PowerShell)
# Starts Qdrant (Docker), Backend (uvicorn), and Frontend (Next.js)

Write-Host "`n=== Aletheia Startup ===" -ForegroundColor Cyan

# Check prerequisites
function Check-Command($cmd) {
    return (Get-Command $cmd -ErrorAction SilentlyContinue) -ne $null
}

if (-not (Check-Command "docker")) {
    Write-Host "[WARN] Docker not found. Qdrant will not start. Running without vector search." -ForegroundColor Yellow
} else {
    Write-Host "[1/3] Starting Qdrant vector database..." -ForegroundColor Green
    docker compose up qdrant -d 2>&1 | Out-Null
    Write-Host "      Qdrant started at http://localhost:6333" -ForegroundColor DarkGray
}

if (-not (Check-Command "ollama")) {
    Write-Host "[WARN] Ollama not found. Install from https://ollama.ai" -ForegroundColor Yellow
} else {
    $models = ollama list 2>&1
    Write-Host "[INFO] Ollama models available:" -ForegroundColor DarkGray
    Write-Host $models -ForegroundColor DarkGray
}

Write-Host "`n[2/3] Starting Python backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn app.main:app --reload --port 8000"
) -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[3/3] Starting Next.js frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"
) -WindowStyle Normal

Write-Host "`n=== All services started ===" -ForegroundColor Cyan
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "  API docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Qdrant UI: http://localhost:6333/dashboard" -ForegroundColor White
Write-Host "`nPress any key to exit this launcher..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
