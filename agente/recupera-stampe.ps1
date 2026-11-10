# Cerca in Outlook tutte le stampe dello stock arrivate per posta (allegato stock_auto_usato*.pdf) e le salva nell'archivio.
# Non cancella e non sposta nessuna mail. Le stampe gia' presenti nell'archivio non vengono riscritte.
# Uso:  powershell -ExecutionPolicy Bypass -File agente\recupera-stampe.ps1 -Archivio "G:\Il mio Drive\..."  [-Prova]
param([Parameter(Mandatory = $true)][string]$Archivio, [switch]$Prova)

$ErrorActionPreference = 'Stop'
$Allegato = 'stock_auto_usato*.pdf'
if (-not $Prova) { New-Item -ItemType Directory -Force $Archivio | Out-Null }

$outlook = New-Object -ComObject Outlook.Application
$ns = $outlook.GetNamespace('MAPI')
$viste = 0; $trovate = @{}; $salvate = 0

function Guarda($cartella) {
    try { $elementi = $cartella.Items.Restrict('@SQL="urn:schemas:httpmail:hasattachment" = 1') } catch { return }
    foreach ($mail in $elementi) {
        $script:viste++
        try {
            foreach ($att in $mail.Attachments) {
                $nome = [string]$att.FileName
                if ($nome -notlike $Allegato) { continue }
                if ($script:trovate.ContainsKey($nome)) { continue }
                $script:trovate[$nome] = "$($mail.ReceivedTime.ToString('yyyy-MM-dd HH:mm'))  $($mail.SenderName)  [$($cartella.Name)]"
                $dest = Join-Path $Archivio $nome
                if (-not $Prova -and -not (Test-Path $dest)) { $att.SaveAsFile($dest); $script:salvate++ }
            }
        } catch {}
    }
    foreach ($sotto in $cartella.Folders) { Guarda $sotto }
}

foreach ($store in $ns.Stores) {
    try { Guarda $store.GetRootFolder() } catch {}
}

$trovate.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0}  <-  {1}" -f $_.Name, $_.Value }
"Mail con allegati guardate: $viste. Stampe trovate: $($trovate.Count). Salvate ora: $salvate."
