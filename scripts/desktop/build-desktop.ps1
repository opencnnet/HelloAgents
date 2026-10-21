#Requires -Version 5.1
<#
.SYNOPSIS
  一键打包 HelloAgents 桌面端：内置 Python 后端 sidecar + Tauri 壳 + 离线 NSIS 安装包。

.DESCRIPTION
  产物：
    - 内置后端：ai-chat/src-tauri/binaries/helloagents-backend-<triple>.exe
    - 安装包：ai-chat/release/helloagents-chat-<version>-setup.exe（内嵌 WebView2 离线安装器）

  前置条件（脚本会检查并给出提示）：
    - Node.js 18+ 与 corepack（使用仓库锁定的 pnpm）
    - Rust 工具链（rustc / cargo）
    - 仓库根目录已创建 .venv（uv sync --extra web --extra mcp --extra anthropic --extra desktop）
    - 构建机可联网一次：Tauri 会下载 NSIS 与 WebView2 离线安装器，之后可离线重复构建

.EXAMPLE
  pwsh scripts/desktop/build-desktop.ps1

.EXAMPLE
  # 只重打前端与安装包（复用已构建的 sidecar）
  pwsh scripts/desktop/build-desktop.ps1 -SkipBackend
#>
[CmdletBinding()]
param(
  [switch]$SkipBackend,
  [switch]$SkipInstall,
  [ValidateSet('nsis', 'msi', 'all')]
  [string]$Bundle = 'nsis',
  # 保留 PyInstaller / sidecar 中间产物，便于反复调试打包流程。
  [switch]$KeepWork,
  # 额外删除 cargo target 与前端 dist（下次构建会全量重编，耗时数分钟）。
  [switch]$CleanAll,
  [string]$OutputDir
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ChatDir = Join-Path $RepoRoot 'ai-chat'
$Python = Join-Path $RepoRoot '.venv\Scripts\python.exe'
$BinariesDir = Join-Path $ChatDir 'src-tauri\binaries'
$ReleaseDir = if ($OutputDir) { $OutputDir } else { Join-Path $ChatDir 'release' }

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Assert-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "缺少命令 $Name。$Hint"
  }
}

function Invoke-External([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令失败（退出码 $LASTEXITCODE）：$Exe $($Arguments -join ' ')"
  }
}

function Invoke-Pnpm([string[]]$Arguments) {
  Invoke-External 'corepack' (@('pnpm@9.15.4') + $Arguments)
}

function Get-TargetTriple {
  $hostLine = (& rustc -vV) | Where-Object { $_ -like 'host:*' } | Select-Object -First 1
  if (-not $hostLine) { throw '无法从 rustc -vV 读取 host triple' }
  return $hostLine.Split(':', 2)[1].Trim()
}

Write-Step '检查构建环境'
Assert-Command 'node' '请安装 Node.js 18 或更高版本。'
Assert-Command 'corepack' '请执行 corepack enable，或安装 pnpm 9。'
Assert-Command 'rustc' '请安装 Rust 工具链（https://rustup.rs）。'
Assert-Command 'cargo' '请安装 Rust 工具链（https://rustup.rs）。'
if (-not (Test-Path $Python)) {
  throw "未找到 $Python。请先执行：uv sync --extra web --extra mcp --extra anthropic --extra desktop"
}
$triple = Get-TargetTriple
Write-Host "仓库：$RepoRoot"
Write-Host "目标：$triple"

if (-not $SkipInstall) {
  Write-Step '安装前端依赖'
  if (-not (Test-Path (Join-Path $ChatDir 'node_modules'))) {
    Push-Location $ChatDir
    try { Invoke-Pnpm @('install', '--frozen-lockfile') } finally { Pop-Location }
  } else {
    Write-Host 'node_modules 已存在，跳过安装（如需重装请删除该目录）。'
  }
}

if (-not $SkipBackend) {
  Write-Step '构建内置后端 sidecar（PyInstaller）'
  Invoke-External $Python @(
    '-X', 'utf8',
    (Join-Path $PSScriptRoot 'build_backend.py'),
    '--output-dir', $BinariesDir
  )
} else {
  Write-Host '已跳过 sidecar 构建。'
}

$sidecar = Join-Path $BinariesDir "helloagents-backend-$triple.exe"
if (-not (Test-Path $sidecar)) {
  throw "缺少 sidecar：$sidecar。请去掉 -SkipBackend 重新构建。"
}

Write-Step "构建桌面端并生成安装包（$Bundle）"
Push-Location $ChatDir
try {
  $tauriArgs = @('exec', 'tauri', 'build', '--bundles', $Bundle)
  Invoke-Pnpm $tauriArgs
} finally {
  Pop-Location
}

Write-Step '整理产物'
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
$version = (Get-Content (Join-Path $ChatDir 'package.json') -Raw | ConvertFrom-Json).version
$bundleRoot = Join-Path $ChatDir 'src-tauri\target\release\bundle'
$patterns = switch ($Bundle) {
  'nsis' { @(@{ Path = 'nsis'; Filter = '*.exe'; Suffix = 'setup' }) }
  'msi' { @(@{ Path = 'msi'; Filter = '*.msi'; Suffix = 'setup' }) }
  default { @(
      @{ Path = 'nsis'; Filter = '*.exe'; Suffix = 'setup' },
      @{ Path = 'msi'; Filter = '*.msi'; Suffix = 'setup' }
    ) }
}

$results = @()
foreach ($item in $patterns) {
  $dir = Join-Path $bundleRoot $item.Path
  if (-not (Test-Path $dir)) { continue }
  foreach ($file in Get-ChildItem $dir -Filter $item.Filter -File) {
    $ext = [System.IO.Path]::GetExtension($file.Name)
    $target = Join-Path $ReleaseDir "helloagents-chat-$version-$($item.Suffix)$ext"
    Copy-Item $file.FullName $target -Force
    $results += Get-Item $target
  }
}

if ($results.Count -eq 0) {
  throw "未在 $bundleRoot 找到安装包，请检查 Tauri 构建日志。"
}

Write-Step '清理中间文件'
function Remove-WorkPath([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $sizeMb = [Math]::Round(((Get-ChildItem $Path -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum) / 1MB, 1)
  Remove-Item $Path -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $Path) {
    Write-Host ("  跳过（被占用）：{0}" -f $Path) -ForegroundColor Yellow
  } else {
    Write-Host ("  已删除 {0}（{1} MB）" -f $Path, $sizeMb)
  }
}

if ($KeepWork) {
  Write-Host '  已指定 -KeepWork，保留 PyInstaller 与 sidecar 中间产物。'
} else {
  # PyInstaller 的 build/dist/spec 与 sidecar 副本都已打进安装包，属于纯中间产物。
  Remove-WorkPath (Join-Path $RepoRoot 'build\desktop-backend')
  Remove-WorkPath $BinariesDir
}
if ($CleanAll) {
  # cargo target 是最大的中间产物（数 GB），删除后下次构建需要全量重编。
  Remove-WorkPath (Join-Path $ChatDir 'src-tauri\target')
  Remove-WorkPath (Join-Path $ChatDir 'dist')
}

Write-Step '完成'
foreach ($file in $results) {
  $sizeMb = [Math]::Round($file.Length / 1MB, 1)
  Write-Host ("安装包：{0}（{1} MB，内嵌 WebView2 离线安装器）" -f $file.FullName, $sizeMb) -ForegroundColor Green
}
Write-Host '安装后首次启动会自动拉起内置后端，技能目录位于 %LOCALAPPDATA%\cn.helloagents.chat\skills。'
if (-not $KeepWork) {
  Write-Host '下次打包可加 -KeepWork 保留 sidecar，之后即可用 -SkipBackend 只重打安装包。'
}
$targetDir = Join-Path $ChatDir 'src-tauri\target'
if (Test-Path $targetDir) {
  $targetMb = [Math]::Round(((Get-ChildItem $targetDir -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum) / 1MB, 0)
  Write-Host ("cargo 增量编译目录保留：{0}（约 {1} MB）；需要彻底清理请加 -CleanAll。" -f $targetDir, $targetMb)
}
