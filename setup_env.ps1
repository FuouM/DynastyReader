# Create local directories
$RootPath = $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$RootPath\.rust"
New-Item -ItemType Directory -Force -Path "$RootPath\.rust\.rustup"
New-Item -ItemType Directory -Force -Path "$RootPath\.rust\.cargo"

# Set temporary environment variables for installation
$env:RUSTUP_HOME = "$RootPath\.rust\.rustup"
$env:CARGO_HOME = "$RootPath\.rust\.cargo"

Write-Host "Downloading rustup-init.exe..."
curl.exe -L -o "$RootPath\.rust\rustup-init.exe" https://win.rustup.rs/x86_64

if (Test-Path "$RootPath\.rust\rustup-init.exe") {
    Write-Host "Installing Rust locally..."
    Start-Process -FilePath "$RootPath\.rust\rustup-init.exe" -ArgumentList "-y", "--no-modify-path", "--default-toolchain", "stable" -NoNewWindow -Wait
    Write-Host "Rust installation completed."
}
else {
    Write-Error "Failed to download rustup-init.exe"
}

# Install sccache into the local cargo bin (temporarily clear the wrapper so cargo can compile it)
$BinPath = "$RootPath\.rust\.cargo\bin"
$SccachePath = "$BinPath\sccache.exe"

if (-not (Test-Path $SccachePath)) {
    Write-Host "Installing sccache..." -ForegroundColor Cyan
    $env:PATH = "$BinPath;$env:PATH"
    $savedWrapper = $env:RUSTC_WRAPPER
    $env:RUSTC_WRAPPER = ""
    cargo install sccache
    $env:RUSTC_WRAPPER = $savedWrapper
    if (Test-Path $SccachePath) {
        Write-Host "sccache installed successfully." -ForegroundColor Green
    } else {
        Write-Error "sccache installation failed."
    }
} else {
    Write-Host "sccache already installed, skipping." -ForegroundColor DarkGray
}
