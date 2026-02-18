# start.ps1 - Start both backend and frontend servers
# Usage: .\start.ps1  (from the meida folder)

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

Write-Host '=== MEIDA - Starting servers ===' -ForegroundColor Cyan

# Kill any existing processes on our ports
foreach ($port in 3001, 3002) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -ne 0 } |
        ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            Write-Host "  Killed process on port $port (PID $_)" -ForegroundColor Yellow
        }
}
Start-Sleep -Seconds 1

# Start backend (FastAPI / uvicorn)
Write-Host '' -NoNewline
Write-Host '[1/2] Starting backend (uvicorn :3001)...' -ForegroundColor Green
$backendJob = Start-Process -PassThru -NoNewWindow -FilePath "$root\.venv\Scripts\python.exe" `
    -ArgumentList '-m', 'uvicorn', 'backend.api:app', '--host', '127.0.0.1', '--port', '3001', '--reload' `
    -WorkingDirectory $root

Start-Sleep -Seconds 2

# Start frontend (Vite :8080)
Write-Host '[2/2] Starting frontend (vite :3002)...' -ForegroundColor Green
$frontendJob = Start-Process -PassThru -NoNewWindow -FilePath 'npm' `
    -ArgumentList 'run', 'dev' `
    -WorkingDirectory "$root\frontend"

Start-Sleep -Seconds 2

Write-Host '' -NoNewline
Write-Host '=== Both servers running ===' -ForegroundColor Cyan
Write-Host '  Frontend:  http://localhost:3002/' -ForegroundColor White
Write-Host '  Backend:   http://127.0.0.1:3001/api/config' -ForegroundColor White
Write-Host '  Press Ctrl+C to stop' -ForegroundColor DarkGray
Write-Host ''

# Wait for Ctrl+C, then clean up
try {
    while ($true) { Start-Sleep -Seconds 5 }
} finally {
    Write-Host '' -NoNewline
    Write-Host 'Shutting down...' -ForegroundColor Yellow
    if ($backendJob -and !$backendJob.HasExited) { Stop-Process -Id $backendJob.Id -Force -ErrorAction SilentlyContinue }
    if ($frontendJob -and !$frontendJob.HasExited) { Stop-Process -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue }
    foreach ($port in 3001, 3002) {
        Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -ne 0 } |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    }
    Write-Host 'Done.' -ForegroundColor Green
}
