# Generate a new independent shop package; never alters cloud state.
param([Parameter(Mandatory=$true)][string]$Slug,[Parameter(Mandatory=$true)][string]$Name,[Parameter(Mandatory=$true)][string]$Url)
$ErrorActionPreference='Stop'
& node (Join-Path $PSScriptRoot 'scripts\new-shop.mjs') --slug $Slug --name $Name --url $Url
if ($LASTEXITCODE -ne 0) { throw 'Shop package generation failed.' }
