# Prova della coda mail dell'agente del PC (lanciata da npm test): Outlook finto, una mail che non parte.
# Prende la funzione InviaPosta (e SalvaCoda) da aggiorna-stock.ps1 senza eseguire il resto dello script.
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'aggiorna-stock.ps1'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$null, [ref]$null)
$funzioni = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and @('InviaPosta', 'SalvaCoda') -contains $n.Name }, $true)
foreach ($fn in $funzioni) { Invoke-Expression $fn.Extent.Text }

$cartella = Join-Path ([IO.Path]::GetTempPath()) ('prova-coda-' + [guid]::NewGuid())
New-Item -ItemType Directory $cartella | Out-Null
$CodaPosta = Join-Path $cartella 'posta-da-inviare.json'   # InviaPosta legge la coda da qui
$global:registro = @()
function Scrivi($t) { $global:registro += $t }
$NonInviare = $false
$outlook = New-Object PSObject
$outlook | Add-Member -MemberType ScriptMethod -Name CreateItem -Value {
  $it = New-Object PSObject -Property @{ To = ''; Subject = ''; HTMLBody = '' }
  $att = New-Object PSObject; $att | Add-Member -MemberType ScriptMethod -Name Add -Value { param($p) }
  $it | Add-Member -NotePropertyName Attachments -NotePropertyValue $att
  $it | Add-Member -MemberType ScriptMethod -Name Send -Value { if ($this.To -match 'rotta') { throw 'Outlook non risponde' } }
  return $it
}

$coda = Join-Path $cartella 'posta-da-inviare.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText($coda, '[{"to":"a@x.it","subject":"uno"},{"to":"rotta@x.it","subject":"due"},{"to":"c@x.it","subject":"tre"}]', $utf8)
InviaPosta
$resto = ConvertFrom-Json ([IO.File]::ReadAllText($coda))
$errori = 0
if (@($resto).Count -ne 1 -or $resto[0].to -ne 'rotta@x.it' -or $resto[0].tentativi -ne 1) { Write-Output "NO: dopo il primo giro in coda doveva restare solo la mail non partita, con 1 tentativo"; $errori++ }
$bytes = [IO.File]::ReadAllBytes($coda)
if ($bytes[0] -eq 0xEF) { Write-Output "NO: la coda e' scritta con il BOM, Node non la leggerebbe"; $errori++ }
for ($i = 0; $i -lt 4; $i++) { InviaPosta }
if (Test-Path $coda) { Write-Output "NO: dopo 5 tentativi la coda doveva essere vuota"; $errori++ }
if (-not ($global:registro -match 'abbandono')) { Write-Output "NO: l'abbandono doveva finire nel registro"; $errori++ }
Remove-Item $cartella -Recurse -Force
if ($errori) { Write-Output "$errori controlli falliti"; exit 1 } else { Write-Output 'TUTTO OK'; exit 0 }
