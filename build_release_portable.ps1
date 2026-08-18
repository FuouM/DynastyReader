# Builds the standalone portable release package for DynastyReader.
# Compiles the production frontend and Rust release binary, then stages
# a clean portable/ distribution folder (with optional zip archive).
param(
    [switch]$Zip,           # Create a portable .zip archive in addition to the staged folder
    [switch]$NoRebuild      # Reuse existing release binary without recompiling
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$OutDir = "$Root\portable"
$RelDir = "$Root\src-tauri\target\release"
$ExePath = "$RelDir\DynastyReader.exe"

# Fallback: check if Cargo emitted dynasty-scans-reader.exe (crate name)
if (-not (Test-Path $ExePath) -and (Test-Path "$RelDir\dynasty-scans-reader.exe")) {
    $ExePath = "$RelDir\dynasty-scans-reader.exe"
}

# 1. Load local Rust toolchain (if present)
if (Test-Path "$Root\env.ps1") {
    . "$Root\env.ps1"
}

# 2. Ensure running instances are closed so binaries are not file-locked
$running = Get-Process "DynastyReader", "dynasty-scans-reader" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Stopping running DynastyReader instances..." -ForegroundColor Yellow
    $running | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

# 3. Compile release bundle
if (-not $NoRebuild -or -not (Test-Path $ExePath)) {
    Write-Host "Building frontend & Rust release binary (Tauri v2)..." -ForegroundColor Cyan
    Push-Location $Root
    try {
        # Check npm dependencies
        if (-not (Test-Path "$Root\node_modules")) {
            Write-Host "Installing npm dependencies..." -ForegroundColor DarkGray
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed!" }
        }

        # Run Tauri build (compiles Vite frontend + Rust release profile)
        npm run tauri build -- --no-bundle
        if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed!" }
    }
    finally {
        # Stop sccache server cleanly if active
        if (Get-Command sccache -ErrorAction SilentlyContinue) {
            sccache --stop-server 2>&1 | Out-Null
        }
        Pop-Location
    }
} else {
    Write-Host "Reusing existing release binary: $ExePath" -ForegroundColor DarkGray
}

# Re-resolve executable path
if (Test-Path "$RelDir\DynastyReader.exe") {
    $ExePath = "$RelDir\DynastyReader.exe"
} elseif (Test-Path "$RelDir\dynasty-scans-reader.exe") {
    $ExePath = "$RelDir\dynasty-scans-reader.exe"
} else {
    throw "Release executable not found in $RelDir!"
}

# 4. Clean & stage portable directory
Write-Host "Staging portable release folder: $OutDir" -ForegroundColor Cyan
if (Test-Path $OutDir) {
    Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutDir | Out-Null

# Copy standalone executable as DynastyReader.exe
Copy-Item -LiteralPath $ExePath -Destination "$OutDir\DynastyReader.exe" -Force

# Copy LICENSE and README
if (Test-Path "$Root\LICENSE") {
    Copy-Item -LiteralPath "$Root\LICENSE" -Destination "$OutDir\LICENSE" -Force
}
if (Test-Path "$Root\README.md") {
    Copy-Item -LiteralPath "$Root\README.md" -Destination "$OutDir\README.md" -Force
}

Write-Host "Portable build staged successfully at: $OutDir\DynastyReader.exe" -ForegroundColor Green

# 5. Optional .zip archive creation
if ($Zip) {
    $ZipPath = "$Root\DynastyReader-v0.1.0-portable.zip"
    Write-Host "Creating zip archive: $ZipPath..." -ForegroundColor Cyan
    if (Test-Path $ZipPath) {
        Remove-Item -LiteralPath $ZipPath -Force
    }
    Compress-Archive -Path "$OutDir\*" -DestinationPath $ZipPath
    Write-Host "Archive created: $ZipPath" -ForegroundColor Green
}
