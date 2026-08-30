param(
    [switch]$Release        # Run in release mode
)

# Launch the standalone Dynasty Scans Reader in dev mode
. "$PSScriptRoot\env.ps1"

$appDir = $PSScriptRoot
$dataDir = Join-Path $appDir ".data"

# Ensure the portable data root exists for dev so the app never writes into src-tauri/target
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$env:DSREADER_DATA_DIR = $dataDir
Write-Host "Portable data dir: $dataDir" -ForegroundColor DarkGray

# First run: install npm dependencies
if (-not (Test-Path -LiteralPath "$appDir\node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    Push-Location $appDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "npm install failed!" -ForegroundColor Red
            exit 1
        }
    }
    finally {
        Pop-Location
    }
}

# Launch Tauri dev server (cargo build happens inside via tauri-cli)
$prevDir = $PWD.Path
Set-Location $appDir
try {
    if ($Release) {
        npm run tauri dev -- --release
    }
    else {
        npm run tauri dev
    }
}
finally {
    # Stop sccache server cleanly if sccache was active
    if (Get-Command sccache -ErrorAction SilentlyContinue) {
        Write-Host "Stopping sccache server..." -ForegroundColor Yellow
        sccache --stop-server 2>&1 | Out-Null
    }

    Set-Location $prevDir
}
