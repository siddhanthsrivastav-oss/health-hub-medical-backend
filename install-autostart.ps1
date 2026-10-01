$ErrorActionPreference = 'Stop'

$backendPath = $PSScriptRoot
$projectPath = Split-Path -Parent $backendPath
$startupPath = [Environment]::GetFolderPath('Startup')
$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source
$startupShortcutPath = Join-Path $startupPath 'Project Ecom.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($startupShortcutPath)

$shortcut.TargetPath = $powerShellPath
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$backendPath\start-local.ps1`""
$shortcut.WorkingDirectory = $projectPath
$shortcut.WindowStyle = 7
$shortcut.Description = 'Starts the Project Ecom API and admin panel after Windows sign-in.'
$shortcut.Save()

Unregister-ScheduledTask -TaskName 'Project_Ecom_Backend' -Confirm:$false -ErrorAction SilentlyContinue
& (Join-Path $backendPath 'start-local.ps1')

Write-Output 'Installed Project Ecom startup shortcut and started local servers.'