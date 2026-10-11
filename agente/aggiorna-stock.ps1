# Cerca in Outlook l'ultima mail con la stampa dello stock, la converte e la pubblica sul sito.
# Uso:  powershell -ExecutionPolicy Bypass -File agente\aggiorna-stock.ps1 [-NonPubblicare]
param([switch]$NonPubblicare)

$ErrorActionPreference = 'Stop'
$Mittenti  = @('Muschitiello', 'Quartieri')      # la mail deve arrivare da una di queste persone
$Allegato  = 'stock_auto_usato*.pdf'
$GiorniMax = 3                                   # quanto indietro guardare nella posta

$repo   = Split-Path $PSScriptRoot -Parent
$arrivi = Join-Path $PSScriptRoot 'arrivi'
$log    = Join-Path $PSScriptRoot 'agente.log'
New-Item -ItemType Directory -Force $arrivi | Out-Null
function Scrivi($msg) { $riga = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $msg; Add-Content -Path $log -Value $riga -Encoding utf8; Write-Output $riga }

try {
    $outlook = New-Object -ComObject Outlook.Application
    $mapi    = $outlook.GetNamespace('MAPI')
    $limite  = (Get-Date).AddDays(-$GiorniMax)
    $trovato = $null

    foreach ($store in $mapi.Stores) {
        try { $inbox = $store.GetDefaultFolder(6) } catch { continue }
        $items = $inbox.Items
        $items.Sort('[ReceivedTime]', $true)
        foreach ($mail in $items) {
            if ($mail.Class -ne 43) { continue }                      # solo messaggi di posta
            if ($mail.ReceivedTime -lt $limite) { break }
            if ($trovato -and $mail.ReceivedTime -le $trovato.Quando) { break }
            $daChi = "$($mail.SenderName) $($mail.SenderEmailAddress)"
            if (-not ($Mittenti | Where-Object { $daChi -match $_ })) { continue }
            foreach ($att in $mail.Attachments) {
                if ($att.FileName -like $Allegato) { $trovato = @{ Quando = $mail.ReceivedTime; Allegato = $att; Mittente = $mail.SenderName }; break }
            }
            if ($trovato -and $trovato.Quando -eq $mail.ReceivedTime) { break }
        }
    }

    if (-not $trovato) { Scrivi "Nessuna mail con lo stock negli ultimi $GiorniMax giorni."; exit 0 }

    # gia' pubblicata: esco in silenzio, cosi' i controlli ripetuti nella giornata non riempiono il registro
    $attuale = Join-Path $repo 'data\stock.json'
    if ((Test-Path $attuale) -and -not $NonPubblicare) {
        $online = (& git -C $repo status --porcelain data) -eq $null
        if ($online -and (Get-Content $attuale -Raw -Encoding utf8) -match ('"source":"' + [regex]::Escape($trovato.Allegato.FileName) + '"')) { exit 0 }
    }

    $pdf = Join-Path $arrivi $trovato.Allegato.FileName
    if (-not (Test-Path $pdf)) { $trovato.Allegato.SaveAsFile($pdf) }
    Scrivi "Trovato $($trovato.Allegato.FileName) da $($trovato.Mittente), ricevuto il $($trovato.Quando.ToString('dd/MM/yyyy HH:mm'))."

    Set-Location $repo
    $esito = & node agente\converti.js $pdf 2>&1 | Out-String
    $codice = $LASTEXITCODE
    Scrivi $esito.Trim()
    if ($codice -ne 0 -and $codice -ne 3) { exit $codice }            # 3 = dati gia' convertiti, restano solo da pubblicare

    if ($NonPubblicare) { Scrivi 'Prova: dati preparati in data\, niente pubblicazione.'; exit 0 }

    # git scrive i suoi messaggi normali sul canale degli errori: passo da cmd perche' PowerShell non li scambi per un guasto
    $env:GIT_TERMINAL_PROMPT = '0'
    cmd /c "git add data 2>&1" | Out-Null
    cmd /c "git commit -q -m ""Stock aggiornato dalla stampa $($trovato.Allegato.FileName)"" 2>&1" | Out-Null
    $push = cmd /c "git push 2>&1" | Out-String
    if ($LASTEXITCODE -ne 0) { Scrivi "Pubblicazione non riuscita: $($push.Trim())"; exit 4 }
    Scrivi 'Pubblicato sul sito.'

    # tengo solo le ultime 10 stampe scaricate
    Get-ChildItem $arrivi -Filter *.pdf | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | Remove-Item -Force
}
catch { Scrivi "Errore: $($_.Exception.Message)"; exit 1 }
