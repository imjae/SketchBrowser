param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$runnerDirectory = Join-Path $env:LOCALAPPDATA 'SketchBrowserRunner'
$runnerScript = Join-Path $PSScriptRoot 'main.mjs'
$pidFile = Join-Path $runnerDirectory 'process.json'
if (Test-Path -LiteralPath $pidFile) {
    $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.id)" -ErrorAction SilentlyContinue
    if ($existing -and $existing.CommandLine.Contains($runnerScript)) {
        if ($Stop) { Stop-Process -Id $record.id; Remove-Item -LiteralPath $pidFile; Write-Output '실행기를 중지했습니다.' }
        else { Write-Output "실행 중입니다. PID $($record.id)" }
        exit 0
    }
}
if ($Stop) { Write-Output '실행 중인 프로세스가 없습니다.'; exit 0 }
if (!(Test-Path -LiteralPath (Join-Path $runnerDirectory 'config.json'))) { throw '먼저 pnpm review:setup을 실행해 주세요.' }
$nodeExecutable = (Get-Command node.exe).Source
$process = Start-Process -FilePath $nodeExecutable -ArgumentList @('"' + $runnerScript + '"') -WorkingDirectory $runnerDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runnerDirectory 'runner.log') -RedirectStandardError (Join-Path $runnerDirectory 'runner-errors.log') -PassThru
@{id=$process.Id; script=$runnerScript} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8
Write-Output "PC 실행기를 시작했습니다. PID $($process.Id)"
