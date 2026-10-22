<#
.SYNOPSIS
Copy the rendered EXP handout and its local dependency tree to the website.
.EXAMPLE
.\Sync-WebsiteHandout.ps1 -WebsiteRoot '..\e46df133eed7d67b.github.io' -WhatIf
.EXAMPLE
.\Sync-WebsiteHandout.ps1 -WebsiteRoot 'D:\projects\e46df133eed7d67b.github.io'
.NOTES
Run quarto render index.qmd first. HandoutRoot defaults to this script's folder;
WebsiteRoot is required, so neither repository location is hard-coded. This script
never commits, pushes, renders, deletes files, or changes GitHub Pages settings.
It only writes inside talks/exp-26/handout, and never touches either landing page.
Old unreferenced assets are deliberately left alone; there is no mirror/delete mode.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$WebsiteRoot,
    [string]$HandoutRoot = $PSScriptRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-NoReparsePoint([string]$Path) {
    # Reject symlinks/junctions so a nested destination cannot redirect writes.
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Symlink/junction paths are not supported: $cursor"
            }
        }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }
        $cursor = $parent.FullName
    }
}

$sourceRoot = (Resolve-Path -LiteralPath $HandoutRoot).Path.TrimEnd('\', '/')
$siteRoot = (Resolve-Path -LiteralPath $WebsiteRoot).Path.TrimEnd('\', '/')
$destinationRoot = [IO.Path]::GetFullPath((Join-Path $siteRoot 'talks/exp-26/handout'))
Assert-NoReparsePoint $sourceRoot
Assert-NoReparsePoint $destinationRoot
if ($siteRoot -eq $sourceRoot -or $siteRoot.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'WebsiteRoot must be a separate website directory outside HandoutRoot.'
}
foreach ($name in @('index.html', 'style.css', 'theme.js', 'favicon.svg', 'CNAME', '.nojekyll', 'talks/index.html', 'talks/exp-26/index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $siteRoot $name) -PathType Leaf)) {
        throw "WebsiteRoot is not the prepared current website; missing $name. Do not use the archived export."
    }
}
if ((Get-Content -LiteralPath (Join-Path $siteRoot 'CNAME') -Raw).Trim() -ne 'asmith.be') {
    throw 'Expected the existing asmith.be website CNAME; nothing was copied.'
}
$htmlPath = Join-Path $sourceRoot 'index.html'
$html = Get-Content -LiteralPath $htmlPath -Raw
if ($html -notmatch '<meta\s+name="robots"\s+content="noindex"\s*/?>' -or
    $html -notmatch '<link\s+rel="canonical"\s+href="https://asmith\.be/talks/exp-26/handout/"\s*/?>') {
    throw 'Rendered index.html is missing the required noindex/canonical metadata. Run quarto render index.qmd.'
}
foreach ($inputFile in @((Join-Path $sourceRoot 'index.qmd')) + @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'assets') -Filter '*.html' -File | ForEach-Object { $_.FullName })) {
    if ((Get-Item -LiteralPath $inputFile).LastWriteTimeUtc -gt (Get-Item -LiteralPath $htmlPath).LastWriteTimeUtc) {
        throw "Render is older than $inputFile. Run quarto render index.qmd before copying."
    }
}

# Follow local HTML src/href, CSS url(), and static module imports. This copies
# only referenced runtime files, not Quarto source, verification data, or includes.
$pending = New-Object 'System.Collections.Generic.Queue[string]'
$files = @{}
$pending.Enqueue('index.html')
$pending.Enqueue('assets/fonts/OFL.txt') # License for the referenced local font.
$baseUri = [Uri]'https://publication.invalid/'
while ($pending.Count -gt 0) {
    $relative = $pending.Dequeue()
    if ($files.ContainsKey($relative)) { continue }
    if ($relative -ne 'index.html' -and $relative -notmatch '^(assets|index_files)/') {
        throw "Unexpected local dependency '$relative'. Review the publication allowlist before copying."
    }
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $sourceRoot $relative))
    if (-not $sourcePath.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Dependency escapes HandoutRoot: $relative"
    }
    Assert-NoReparsePoint $sourcePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Missing dependency: $relative" }
    $files[$relative] = $sourcePath
    $extension = [IO.Path]::GetExtension($relative).ToLowerInvariant()
    $patterns = switch ($extension) {
        '.html' { '(?:src|href)\s*=\s*["'']([^"'']+)["'']' }
        '.css' { 'url\(\s*["'']?([^\s)"'']+)["'']?\s*\)' }
        '.js' { '(?:\bfrom\s*|\bimport\s*\(?\s*)["''](\.{1,2}/[^"'']+)["'']' }
        default { $null }
    }
    if ($patterns) {
        $text = Get-Content -LiteralPath $sourcePath -Raw
        $fileUri = New-Object Uri($baseUri, $relative)
        foreach ($match in [regex]::Matches($text, $patterns, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
            $reference = [Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
            if ($reference -match '^(#|//|[a-z][a-z0-9+.-]*:)') { continue }
            if ($reference.StartsWith('/')) { throw "Root-relative resource needs review: $reference" }
            $resolved = New-Object Uri($fileUri, $reference)
            $dependency = [Uri]::UnescapeDataString($resolved.AbsolutePath).TrimStart('/')
            $pending.Enqueue($dependency)
        }
    }
}

# Validate every destination before any writes; never use a recursive mirror.
foreach ($relative in $files.Keys) {
    $destination = [IO.Path]::GetFullPath((Join-Path $destinationRoot $relative))
    if (-not $destination.StartsWith($destinationRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Destination escapes the handout directory: $relative"
    }
    Assert-NoReparsePoint $destination
}
if ($PSCmdlet.ShouldProcess($destinationRoot, "Copy $($files.Count) validated publication files (no deletions)")) {
    # Dependencies first; replace the entry point last to reduce partial updates.
    $ordered = @($files.Keys | Where-Object { $_ -ne 'index.html' } | Sort-Object) + @('index.html')
    foreach ($relative in $ordered) {
        $destination = Join-Path $destinationRoot $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        Copy-Item -LiteralPath $files[$relative] -Destination $destination -Force
        if ((Get-FileHash -LiteralPath $files[$relative]).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
            throw "Copy verification failed: $relative"
        }
    }
    Write-Host "Copied and verified $($files.Count) files to $destinationRoot"
    Write-Host 'Local files only. Review the website diff before any commit or push.'
}
