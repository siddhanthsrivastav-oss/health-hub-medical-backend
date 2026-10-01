$ErrorActionPreference = 'Stop'

$backendPath = $PSScriptRoot
$projectPath = Split-Path -Parent $backendPath
$adminPanelPath = Join-Path $projectPath 'AdminPanel'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$commandPath = (Get-Command cmd.exe -ErrorAction Stop).Source

$backendRunning = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if (-not $backendRunning) {
    Start-Process `
        -FilePath $nodePath `
        -ArgumentList 'index.js' `
        -WorkingDirectory $backendPath `
        -WindowStyle Hidden | Out-Null
}

$adminPanelRunning = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if (-not $adminPanelRunning) {
    Start-Process `
        -FilePath $commandPath `
        -ArgumentList '/c', 'npm run dev -- --host 127.0.0.1' `
        -WorkingDirectory $adminPanelPath `
        -WindowStyle Hidden | Out-Null
}