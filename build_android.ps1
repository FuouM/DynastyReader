# Android Build and Launch Script for DynastyReader
param(
    [switch]$Release,
    [switch]$Dev,
    [string]$Target = "aarch64"
)

$PSScriptRoot_Local = $PSScriptRoot
. "$PSScriptRoot_Local\env.ps1"

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
