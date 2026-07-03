# Sync repo skills into the local Claude Code runtime (~/.claude/skills).
# Usage: ./scripts/sync-to-local.ps1            # all skills
#        ./scripts/sync-to-local.ps1 -Only claude-md,model-routing
param([string[]]$Only)

$repoSkills = Join-Path $PSScriptRoot '..\skills'
$dest = Join-Path $HOME '.claude\skills'

Get-ChildItem $repoSkills -Directory | ForEach-Object {
    Get-ChildItem $_.FullName -Directory | ForEach-Object {
        if ($Only -and $Only -notcontains $_.Name) { return }
        robocopy $_.FullName (Join-Path $dest $_.Name) /MIR /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) { Write-Error "robocopy failed for $($_.Name)" }
        else { Write-Host "synced $($_.Name)" }
    }
}
exit 0
