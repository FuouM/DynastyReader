# Android Build and Launch Script for DynastyReader
param(
    [switch]$Release,
    [switch]$Dev,
    [string]$Target = "aarch64"
)

$PSScriptRoot_Local = $PSScriptRoot
. "$PSScriptRoot_Local\env.ps1"

# Load .env configuration if present
$envFile = "$PSScriptRoot_Local\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split '=', 2
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"').Trim("'")
            if (-not (Get-Item "env:$key" -ErrorAction SilentlyContinue)) {
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
                Set-Item "env:$key" $val
            }
        }
    }
}

# Read SDK directory from local.properties if present and ANDROID_HOME isn't explicitly set
if (-not $env:ANDROID_HOME) {
    $localProp = "$PSScriptRoot_Local\src-tauri\gen\android\local.properties"
    if (Test-Path $localProp) {
        $sdkLine = Get-Content $localProp | Where-Object { $_ -match '^sdk\.dir\s*=' } | Select-Object -First 1
        if ($sdkLine) {
            $parsed = ($sdkLine -split '=', 2)[1].Trim() -replace '\\\\', '\' -replace '\\:', ':'
            if (Test-Path $parsed) {
                $env:ANDROID_HOME = $parsed
            }
        }
    }
}

# Ensure NDK_HOME points to installed NDK under SDK
if ($env:ANDROID_HOME -and (-not $env:NDK_HOME)) {
    $ndkCandidate = Get-ChildItem "$env:ANDROID_HOME\ndk\*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
    if ($ndkCandidate) {
        $env:NDK_HOME = $ndkCandidate
    }
}

# Add platform-tools (adb) to PATH
if ($env:ANDROID_HOME -and (Test-Path "$env:ANDROID_HOME\platform-tools")) {
    if ($env:PATH -notlike "*$env:ANDROID_HOME\platform-tools*") {
        $env:PATH = "$env:ANDROID_HOME\platform-tools;$env:PATH"
    }
}

# Precheck: Validate Android SDK and NDK paths before building
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    Write-Host "`n[ERROR] ANDROID_HOME is not set or valid. Please install the Android SDK or configure local.properties." -ForegroundColor Red
    exit 1
}
if (-not $env:NDK_HOME -or -not (Test-Path $env:NDK_HOME)) {
    Write-Host "`n[ERROR] NDK_HOME is not set or valid. Please install the NDK under `$env:ANDROID_HOME\ndk\`." -ForegroundColor Red
    exit 1
}

# Sync custom app launcher icons from src-tauri/icons/android into Android project res
$iconsAndroidDir = "$PSScriptRoot_Local\src-tauri\icons\android"
$androidResDir = "$PSScriptRoot_Local\src-tauri\gen\android\app\src\main\res"
if ((Test-Path $iconsAndroidDir) -and (Test-Path $androidResDir)) {
    Write-Host "Syncing app launcher icons..." -ForegroundColor Cyan
    Get-ChildItem -Path $iconsAndroidDir -Recurse | ForEach-Object {
        $relPath = $_.FullName.Substring($iconsAndroidDir.Length + 1)
        $targetPath = Join-Path $androidResDir $relPath
        if ($_.PSIsContainer) {
            if (-not (Test-Path $targetPath)) { New-Item -ItemType Directory -Path $targetPath -Force | Out-Null }
        } else {
            Copy-Item -Path $_.FullName -Destination $targetPath -Force
        }
    }
}

# Sync release.keystore into Android app directory if present at root
$rootKeystore = "$PSScriptRoot_Local\release.keystore"
$appKeystore = "$PSScriptRoot_Local\src-tauri\gen\android\app\release.keystore"
if (Test-Path $rootKeystore) {
    Copy-Item $rootKeystore $appKeystore -Force
}

if ($Release) {
    if (-not $env:TAURI_STORE_FILE) { $env:TAURI_STORE_FILE = "release.keystore" }
    if (-not $env:TAURI_KEY_ALIAS) { $env:TAURI_KEY_ALIAS = "dynasty" }
    if (-not $env:TAURI_STORE_PASSWORD -and $env:ANDROID_STORE_PASSWORD) { $env:TAURI_STORE_PASSWORD = $env:ANDROID_STORE_PASSWORD }
    if (-not $env:TAURI_KEY_PASSWORD -and $env:ANDROID_KEY_PASSWORD) { $env:TAURI_KEY_PASSWORD = $env:ANDROID_KEY_PASSWORD }
    if (-not $env:TAURI_STORE_PASSWORD) {
        $localTauriProp = "$PSScriptRoot_Local\src-tauri\gen\android\app\tauri.properties"
        if (Test-Path $localTauriProp) {
            $passLine = Get-Content $localTauriProp | Where-Object { $_ -match '^tauri\.android\.storePassword\s*=' } | Select-Object -First 1
            if ($passLine) {
                $env:TAURI_STORE_PASSWORD = ($passLine -split '=', 2)[1].Trim()
            }
        }
    }
    if (-not $env:TAURI_KEY_PASSWORD -and $env:TAURI_STORE_PASSWORD) {
        $env:TAURI_KEY_PASSWORD = $env:TAURI_STORE_PASSWORD
    }

    # Immediate precheck: Keystore file existence
    $keystoreCandidate1 = "$PSScriptRoot_Local\$($env:TAURI_STORE_FILE)"
    $keystoreCandidate2 = "$PSScriptRoot_Local\src-tauri\gen\android\app\$($env:TAURI_STORE_FILE)"
    if (-not (Test-Path $keystoreCandidate1) -and -not (Test-Path $keystoreCandidate2)) {
        Write-Host "`n[ERROR] Release build requested but keystore file '$($env:TAURI_STORE_FILE)' was not found." -ForegroundColor Red
        Write-Host "Place 'release.keystore' in the project root or specify `$env:TAURI_STORE_FILE." -ForegroundColor Yellow
        exit 1
    }

    # Immediate precheck: Keystore password presence
    if ([string]::IsNullOrWhiteSpace($env:TAURI_STORE_PASSWORD)) {
        Write-Host "`n[ERROR] Release build requested but signing password is missing." -ForegroundColor Red
        Write-Host "Set `$env:TAURI_STORE_PASSWORD (or `$env:ANDROID_STORE_PASSWORD, or specify in tauri.properties) before building --Release." -ForegroundColor Yellow
        exit 1
    }
}

if ($Dev) {
    npx tauri android dev
} else {
    if ($Release) {
        Write-Host "Building Android Release APK (Target: $Target)..." -ForegroundColor Cyan
        npx tauri android build --apk --target $Target
    } else {
        Write-Host "Building Android Debug APK (Target: $Target)..." -ForegroundColor Cyan
        npx tauri android build --apk --debug --target $Target
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nBuild completed successfully! Finding generated APKs..." -ForegroundColor Green
        $apkDir = "$PSScriptRoot_Local\src-tauri\gen\android\app\build\outputs\apk"
        if (Test-Path $apkDir) {
            $apks = Get-ChildItem -Path $apkDir -Recurse -Filter "*.apk" | Sort-Object LastWriteTime -Descending
            if ($apks) {
                Write-Host "`nGenerated APKs:" -ForegroundColor Yellow
                foreach ($apk in $apks) {
                    $sizeMb = [math]::Round($apk.Length / 1MB, 2)
                    Write-Host "  -> $($apk.FullName) ($sizeMb MB)" -ForegroundColor White
                }
                Write-Host "`nTo install directly onto a connected phone with ADB:" -ForegroundColor Cyan
                Write-Host "  adb install -r `"$($apks[0].FullName)`"" -ForegroundColor Gray
                Write-Host "`nNote: If upgrading an existing installation and you see a signature mismatch error, uninstall the previous version on your phone first." -ForegroundColor Gray
            }
        }
    }
}
