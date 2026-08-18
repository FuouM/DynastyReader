# Local Rust Environment Setup for Project Curator
$RootPath = $PSScriptRoot

$env:RUSTUP_HOME = "$RootPath\.rust\.rustup"
$env:CARGO_HOME = "$RootPath\.rust\.cargo"

$BinPath = "$RootPath\.rust\.cargo\bin"
if ($env:PATH -notlike "*$BinPath*") {
    $env:PATH = "$BinPath;" + $env:PATH
}

$SccacheExe = "$BinPath\sccache.exe"
if (Test-Path $SccacheExe) {
    $env:RUSTC_WRAPPER = $SccacheExe
    $env:SCCACHE_DIR = "$RootPath\.rust\.sccache"
    $env:SCCACHE_CONF = "$RootPath\.rust\sccache.toml"
} else {
    $env:RUSTC_WRAPPER = ""
}

Write-Host "Local Rust environment loaded." -ForegroundColor Green
Write-Host "RUSTUP_HOME:        $env:RUSTUP_HOME"
Write-Host "CARGO_HOME:         $env:CARGO_HOME"
if ($env:RUSTC_WRAPPER) {
    Write-Host "RUSTC_WRAPPER:      $env:RUSTC_WRAPPER (sccache enabled)"
} else {
    Write-Host "RUSTC_WRAPPER:      None (sccache not installed, standard compilation)"
}

Write-Host "rustc version:"
rustc --version
