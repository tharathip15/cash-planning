param(
  [Parameter(Mandatory=$true)][string]$PrivateDirectory,
  [Parameter(Mandatory=$true)][string]$Cloudflared,
  [Parameter(Mandatory=$true)][string]$Node,
  [Parameter(Mandatory=$true)][string]$VercelCli
)
$ErrorActionPreference='Stop'
$cashRoot=[System.IO.Path]::GetFullPath($PrivateDirectory)
$cashAllowedRoot=Join-Path $env:USERPROFILE '.codex\private-data\CASH_PLANNING'
if(-not $cashRoot.StartsWith($cashAllowedRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Cash private directory is outside the expected root'}
$cashSourceRoot=Split-Path -Parent $PSScriptRoot
$cashTaskName='PFIG Cash Planning - Central service'
if(Get-ScheduledTask -TaskName $cashTaskName -ErrorAction SilentlyContinue){throw 'Cash service already exists; review the active release before reinstalling'}
$cashRuntime=Join-Path $cashRoot 'cash-runtime.secret.json'
$cashEdge=Get-Content -LiteralPath (Join-Path $cashRoot 'edge-config.secret.json') -Raw | ConvertFrom-Json
foreach($cashRequiredPath in @($Node,$Cloudflared,$VercelCli,$cashRuntime)){if(-not (Test-Path -LiteralPath $cashRequiredPath)){throw 'A required service file is missing'}}
$cashSourceFiles=@(Get-ChildItem -LiteralPath (Join-Path $cashSourceRoot 'server') -File | Where-Object {$_.Extension -in '.mjs','.sql'})
$cashSourceFiles+=Get-Item -LiteralPath (Join-Path $PSScriptRoot 'supervise-central.mjs')
$cashHashText=($cashSourceFiles | Sort-Object FullName | ForEach-Object {(Get-FileHash -LiteralPath $_.FullName).Hash}) -join ''
$cashHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($cashHashText))).Substring(0,16).ToLowerInvariant()
$cashRelease=Join-Path $cashRoot ('releases\backend-'+$cashHash)
if(Test-Path -LiteralPath $cashRelease){throw 'Immutable release directory already exists'}
foreach($cashDirectory in @($cashRelease,(Join-Path $cashRelease 'server'),(Join-Path $cashRelease 'scripts'),(Join-Path $cashRelease 'node_modules'))){New-Item -ItemType Directory -Path $cashDirectory -Force | Out-Null}
foreach($cashFile in $cashSourceFiles){
  $cashRelative=[System.IO.Path]::GetRelativePath($cashSourceRoot,$cashFile.FullName)
  Copy-Item -LiteralPath $cashFile.FullName -Destination (Join-Path $cashRelease $cashRelative) -ErrorAction Stop
}
Copy-Item -LiteralPath (Join-Path $cashSourceRoot 'node_modules\postgres') -Destination (Join-Path $cashRelease 'node_modules\postgres') -Recurse -ErrorAction Stop
$cashManifest=[ordered]@{}
foreach($cashFile in Get-ChildItem -LiteralPath $cashRelease -Recurse -File){
  if($cashFile.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Release links are not allowed'}
  $cashManifest[[IO.Path]::GetRelativePath($cashRelease,$cashFile.FullName).Replace('\','/')]=(Get-FileHash -LiteralPath $cashFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$cashManifestFile=Join-Path $cashRoot ('backend-'+$cashHash+'-sha256.json')
[IO.File]::WriteAllText($cashManifestFile,($cashManifest | ConvertTo-Json -Depth 3),[Text.UTF8Encoding]::new($false))
$cashOperationsFile=Join-Path $cashRoot 'operations.secret.json'
$cashOperations=@{privateDirectory=$cashRoot;release=$cashRelease;runtimeFile=$cashRuntime;manifestFile=$cashManifestFile;node=$Node;cloudflared=$Cloudflared;vercelCli=$VercelCli;edgeConfigId=$cashEdge.id;project='cash-planning';scope='pfig'}
[IO.File]::WriteAllText($cashOperationsFile,($cashOperations | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
$cashWrapper=Join-Path $cashRoot 'start-cash-service.ps1'
$cashWrapperSource=@'
param([Parameter(Mandatory=$true)][string]$SettingsPath)
$ErrorActionPreference='Stop'
$cashSettings=Get-Content -LiteralPath $SettingsPath -Raw | ConvertFrom-Json
$cashSupervisorPath=Join-Path $cashSettings.release 'scripts\supervise-central.mjs'
$cashChild=Start-Process -FilePath $cashSettings.node -ArgumentList @(('"'+$cashSupervisorPath+'"'),('"'+$SettingsPath+'"')) -WorkingDirectory $cashSettings.release -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $cashSettings.privateDirectory 'supervisor.stdout.log') -RedirectStandardError (Join-Path $cashSettings.privateDirectory 'supervisor.stderr.log')
exit $cashChild.ExitCode
'@
[IO.File]::WriteAllText($cashWrapper,$cashWrapperSource,[Text.UTF8Encoding]::new($false))
# Only the reviewed temporary Cash backend can be replaced; never kill another listener.
$cashListener=Get-NetTCPConnection -State Listen -LocalPort 8792 -ErrorAction SilentlyContinue
if($cashListener){
  $cashProcess=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$cashListener.OwningProcess)
  if($cashProcess.Name -ne 'node.exe' -or $cashProcess.CommandLine -notmatch 'server[/\\]start-central\.mjs' -or -not $cashProcess.CommandLine.Contains($cashRuntime)){throw 'Port 8792 is owned by an unexpected process'}
  Stop-Process -Id $cashListener.OwningProcess -Force
}
$cashIdentity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$cashAction=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$cashWrapper+'" -SettingsPath "'+$cashOperationsFile+'"') -WorkingDirectory $cashRoot
$cashTrigger=New-ScheduledTaskTrigger -AtLogOn -User $cashIdentity
$cashPrincipal=New-ScheduledTaskPrincipal -UserId $cashIdentity -LogonType Interactive -RunLevel Limited
$cashTaskSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $cashTaskName -Action $cashAction -Trigger $cashTrigger -Principal $cashPrincipal -Settings $cashTaskSettings -Description 'Dedicated Cash Planning backend and HTTPS endpoint recovery. No source deployments.' | Out-Null
Start-ScheduledTask -TaskName $cashTaskName
[pscustomobject]@{Task=$cashTaskName;Release=$cashRelease;SourceFiles=$cashManifest.Count;Started=$true} | ConvertTo-Json
