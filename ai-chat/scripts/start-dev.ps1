<#
  HelloAgents 联调一键启动（Windows PowerShell）
  用法：
    powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -Install   # 首次：安装依赖
    powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1            # 启动
    powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -Live      # 真实模型（仓库根目录 .env 配好 LLM_*）

  说明：控制台输出使用英文，避免 Windows PowerShell 5.1 的编码差异。
#>
param(
  [switch]$Install,
  [switch]$Live
)

$ErrorActionPreference = 'Stop'

$FrontDir = Split-Path -Parent $PSScriptRoot
$RepoDir = Split-Path -Parent $FrontDir
$BackendUrl = 'http://127.0.0.1:8000'
$FrontendUrl = 'http://127.0.0.1:5173'

function Assert-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $Name. $Hint"
  }
}

Assert-Command 'python' 'Install Python 3.12/3.13 first.'
Assert-Command 'pnpm' 'Run "corepack enable" or "npm install -g pnpm" first.'

if ($Install) {
  Write-Host '[1/2] Installing backend web requirements ...' -ForegroundColor Cyan
  Push-Location $RepoDir
  try { python -m pip install -r requirements/web.txt } finally { Pop-Location }

  Write-Host '[2/2] Installing frontend dependencies ...' -ForegroundColor Cyan
  Push-Location $FrontDir
  try { pnpm install } finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $RepoDir 'examples\web\fastapi_sse_server.py'))) {
  throw "Backend not found: $RepoDir\examples\web\fastapi_sse_server.py"
}
if (-not (Test-Path (Join-Path $FrontDir 'node_modules'))) {
  throw 'Frontend dependencies are missing. Run: powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -Install'
}

$liveSet = ''
if ($Live) { $liveSet = '$env:HELLOAGENTS_DEMO_LIVE=1; ' }
$backendCommand = "${liveSet}Set-Location '$RepoDir'; python -X utf8 -m examples.web.fastapi_sse_server"
Write-Host 'Starting backend (new window, port 8000) ...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit -Command `"$backendCommand`""

Write-Host 'Waiting for backend ...' -ForegroundColor Cyan
$backendReady = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200) { $backendReady = $true; break }
  } catch {
    Start-Sleep -Seconds 1
  }
}
if (-not $backendReady) {
  Write-Warning 'Backend did not become ready within 45s. Check the backend window for errors.'
}

$frontendCommand = "Set-Location '$FrontDir'; pnpm dev"
Write-Host 'Starting frontend (new window, port 5173) ...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit -Command `"$frontendCommand`""

Write-Host 'Waiting for frontend ...' -ForegroundColor Cyan
$frontendReady = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $response = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200) { $frontendReady = $true; break }
  } catch {
    Start-Sleep -Seconds 1
  }
}
if ($frontendReady) {
  Write-Host "Opening $FrontendUrl" -ForegroundColor Green
  Start-Process $FrontendUrl
} else {
  Write-Warning 'Frontend did not become ready within 30s. Check the frontend window for errors.'
}

Write-Host ''
Write-Host 'Notes:' -ForegroundColor Yellow
Write-Host '  - Default is the backend offline scripted mode. Use -Live with LLM_MODEL_ID/LLM_API_KEY/LLM_BASE_URL in the repo .env for a real model.'
Write-Host '  - ai-chat/.env enables VITE_AUTO_CONNECT_HELLOAGENTS=1: the UI connects to the page origin and Vite proxies /agent to port 8000.'
Write-Host '  - If the browser still shows old settings: Settings -> Clear local data (or Restore defaults, then Save).'
