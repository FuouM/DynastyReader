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

if ($Dev) {
    npx tauri android dev
} elseif ($Release) {
    npx tauri android build --apk --target $Target
} else {
    npx tauri android build --apk --debug --target $Target
}
