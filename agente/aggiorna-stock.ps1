# Agente dello stock usato. Gira ogni 10 minuti (operazione pianificata di Windows) e:
#  1. legge in Outlook le richieste di avviso dei colleghi (oggetto "AVVISO STOCK: ..." / "STOP AVVISO")
#  2. se c'e' una stampa nuova: annunci del sito -> conversione -> storico -> pubblicazione -> riepilogo e avvisi via mail
#  3. aggiorna foto e annunci dal sito ogni 6 ore
#  4. dalle 13, se la stampa di oggi non e' arrivata, ti avvisa una volta
#  5. con la stampa nuova prepara la presentazione per Giuseppe (il lunedi' anche il riepilogo settimanale)
#  6. con la stampa nuova e ogni 6 ore rilegge i listini VW del Desktop e aggiorna i codici modello delle auto
# Uso:  powershell -ExecutionPolicy Bypass -File agente\aggiorna-stock.ps1 [-NonPubblicare] [-NonInviare]
# -Riepilogo rimanda subito il riepilogo dell'ultima stampa pubblicata; -Rapporto rimanda subito la presentazione a Giuseppe (-Settimana aggiunge il riepilogo settimanale)
param([switch]$NonPubblicare, [switch]$NonInviare, [switch]$Riepilogo, [switch]$Rapporto, [switch]$Settimana)

$ErrorActionPreference = 'Stop'
$Mittenti  = @('Muschitiello', 'Quartieri')      # la stampa deve arrivare da una di queste persone
$Allegato  = 'stock_auto_usato*.pdf'
$GiorniMax = 3                                   # quanto indietro guardare nella posta
$OraAllarme = 13                                 # da quest'ora, se la stampa manca, mando un avviso

$repo   = Split-Path $PSScriptRoot -Parent
$arrivi = Join-Path $PSScriptRoot 'arrivi'
$log    = Join-Path $PSScriptRoot 'agente.log'
$statoF = Join-Path $PSScriptRoot 'stato.json'
New-Item -ItemType Directory -Force $arrivi | Out-Null
Set-Location $repo
$env:GIT_TERMINAL_PROMPT = '0'
$oggi = (Get-Date).ToString('yyyy-MM-dd')

# un solo agente alla volta: se ne sta gia' girando uno (programmato o lanciato a mano) esco subito
$blocco = New-Object System.Threading.Mutex($false, 'Local\GestoreStockAgente')
try { $preso = $blocco.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $preso = $true }
if (-not $preso) { exit 0 }

function Scrivi($msg) { $riga = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $msg; Add-Content -Path $log -Value $riga -Encoding utf8; Write-Host $riga }
# node e git scrivono anche sul canale degli errori: passo da cmd perche' PowerShell non li scambi per un guasto
function Esegui($riga) { $out = cmd /c "$riga 2>&1" | Out-String; return @{ Codice = $LASTEXITCODE; Testo = $out.Trim() } }
function LeggiStato { if (Test-Path $statoF) { try { return Get-Content $statoF -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} } return [pscustomobject]@{} }
function SegnaStato($chiave, $valore) { $s = LeggiStato; $s | Add-Member -NotePropertyName $chiave -NotePropertyValue $valore -Force; $s | ConvertTo-Json | Set-Content $statoF -Encoding UTF8 }
function GiaFatto($chiave) { $s = LeggiStato; return ($s.$chiave -eq $oggi) }

function InviaPosta {
    $f = Join-Path $PSScriptRoot 'posta-da-inviare.json'
    if (-not (Test-Path $f)) { return }
    $lista = @()
    # in PowerShell 5.1 ConvertFrom-Json in una pipeline consegna l'elenco intero come un solo oggetto: lo converto a parte e poi lo scorro
    try { $dati = ConvertFrom-Json (Get-Content $f -Raw -Encoding UTF8); foreach ($x in $dati) { $lista += $x } } catch { Scrivi "Coda mail illeggibile, la scarto." }
    Remove-Item $f -Force
    foreach ($m in $lista) {
        if (-not $m -or -not $m.to) { continue }                     # coda vuota o mail senza destinatario: niente da spedire
        if ($NonInviare) { Scrivi "Prova, non inviata a $($m.to): $($m.subject)"; continue }
        try {
            $it = $outlook.CreateItem(0)
            $it.To = $m.to; $it.Subject = $m.subject; $it.HTMLBody = $m.html
            foreach ($a in @($m.allegati)) { if ($a -and (Test-Path $a)) { [void]$it.Attachments.Add([string]$a) } }
            $it.Send()
            Scrivi "Mail inviata a $($m.to): $($m.subject)"
        } catch { Scrivi "Mail non inviata a $($m.to): $($_.Exception.Message)" }
    }
}

# presentazione per Giuseppe: prima rilegge AutoScout (se non risponde, usa i dati dell'ultima lettura)
function PreparaRapporto {
    $m = Esegui 'node agente\mercato.js'
    Scrivi $m.Testo
    $r = Esegui ('node agente\rapporto.js' + $(if ($Settimana) { ' --settimana' } else { '' }))
    Scrivi $r.Testo
    return ($r.Codice -eq 0)
}

function Pubblica($messaggio) {
    if ($NonPubblicare) { Scrivi "Prova, non pubblicato: $messaggio"; return $false }
    $mod = Esegui 'git status --porcelain data'
    if (-not $mod.Testo) { return $false }
    Esegui 'git add data' | Out-Null
    Esegui "git commit -q -m ""$messaggio""" | Out-Null
    # l'agente online puo' aver pubblicato nel frattempo: mi allineo prima di inviare
    Esegui 'git pull --rebase --autostash -q' | Out-Null
    $push = Esegui 'git push'
    if ($push.Codice -ne 0) { throw "Pubblicazione non riuscita: $($push.Testo)" }
    Scrivi "Pubblicato sul sito: $messaggio"
    return $true
}

try {
    $outlook = New-Object -ComObject Outlook.Application
    $mapi    = $outlook.GetNamespace('MAPI')
    $limite  = (Get-Date).AddDays(-$GiorniMax)
    $trovato = $null
    $richieste = @()

    # una sola passata sulla posta recente: stampe dello stock e richieste di avviso
    foreach ($store in $mapi.Stores) {
        try { $inbox = $store.GetDefaultFolder(6) } catch { continue }
        $items = $inbox.Items
        $items.Sort('[ReceivedTime]', $true)
        foreach ($mail in $items) {
            if ($mail.Class -ne 43) { continue }                      # solo messaggi di posta
            if ($mail.ReceivedTime -lt $limite) { break }
            if ($mail.Subject -match '^\s*((r|re|i|fw|fwd)\s*:\s*)*(stop\s+avviso|avviso\s+stock)') {
                $richieste += [pscustomobject]@{ id = $mail.EntryID; email = $mail.SenderEmailAddress; nome = $mail.SenderName; oggetto = $mail.Subject; corpo = ($mail.Body -replace '\s+$', '').Substring(0, [Math]::Min(300, $mail.Body.Length)) }
                continue
            }
            if ($trovato) { continue }
            $daChi = "$($mail.SenderName) $($mail.SenderEmailAddress)"
            if (-not ($Mittenti | Where-Object { $daChi -match $_ })) { continue }
            foreach ($att in $mail.Attachments) {
                if ($att.FileName -like $Allegato) { $trovato = @{ Quando = $mail.ReceivedTime; Allegato = $att; Mittente = $mail.SenderName }; break }
            }
        }
    }

    if ($Rapporto) {
        if (PreparaRapporto) { InviaPosta }
        exit 0
    }

    if ($Riepilogo) {
        $p = Esegui 'node agente\posta.js riepilogo'
        if ($p.Codice -ne 0) { throw $p.Testo }
        InviaPosta; exit 0
    }

    # 1. richieste di avviso dei colleghi
    if ($richieste.Count) {
        [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'richieste.json'), (ConvertTo-Json -InputObject @($richieste) -Depth 3), (New-Object System.Text.UTF8Encoding($false)))
        $r = Esegui 'node agente\posta.js richieste'
        if ($r.Codice -ne 0) { Scrivi $r.Testo } else { InviaPosta }
    }

    # 2. stampa nuova
    $nuova = $false
    if ($trovato) {
        $attuale = Join-Path $repo 'data\stock.json'
        $giaOnline = $false
        if (Test-Path $attuale) {
            $pulito = -not (Esegui 'git status --porcelain data/stock.json').Testo
            $giaOnline = $pulito -and ((Get-Content $attuale -Raw -Encoding UTF8) -match ('"source":"' + [regex]::Escape($trovato.Allegato.FileName) + '"'))
        }
        if (-not $giaOnline) {
            $pdf = Join-Path $arrivi $trovato.Allegato.FileName
            if (-not (Test-Path $pdf)) { $trovato.Allegato.SaveAsFile($pdf) }
            Scrivi "Trovato $($trovato.Allegato.FileName) da $($trovato.Mittente), ricevuto il $($trovato.Quando.ToString('dd/MM/yyyy HH:mm'))."

            $a = Esegui 'node agente\annunci.js'                      # se il sito non risponde si va avanti senza foto nuove
            Scrivi $a.Testo
            $c = Esegui "node agente\converti.js ""$pdf"""
            Scrivi $c.Testo
            if ($c.Codice -ne 0 -and $c.Codice -ne 3) { throw "Stampa non pubblicata. $($c.Testo)" }
            $t = Esegui 'node agente\telecamera.js --max 60'
            Scrivi $t.Testo
            $l = Esegui 'node agente\listini.js'                     # codici modello VW dai listini del Desktop
            Scrivi $l.Testo
            $s = Esegui 'node agente\storico.js'
            Scrivi $s.Testo
            $nuova = Pubblica "Stock aggiornato dalla stampa $($trovato.Allegato.FileName)"

            $giorno = ((Get-Content $attuale -Raw -Encoding UTF8 | ConvertFrom-Json).meta.day)
            if ($nuova -and (LeggiStato).riepilogo -ne $giorno) {
                $p = Esegui 'node agente\posta.js riepilogo avvisi'
                if ($p.Codice -ne 0) { Scrivi $p.Testo } else { InviaPosta; SegnaStato 'riepilogo' $giorno }
            }
            if ($nuova -and (LeggiStato).rapporto -ne $giorno) {
                SegnaStato 'rapporto' $giorno                            # una sola presentazione al giorno, anche se qualcosa va storto
                if (PreparaRapporto) { InviaPosta }
            }
            Get-ChildItem $arrivi -Filter *.pdf | Sort-Object LastWriteTime -Descending | Select-Object -Skip 15 | Remove-Item -Force
        }
    }

    # 3. foto e annunci dal sito, ogni 6 ore durante la giornata
    $annunciF = Join-Path $repo 'data\annunci.json'
    $ora = (Get-Date).Hour
    if (-not $nuova -and $ora -ge 9 -and $ora -lt 20 -and (-not (Test-Path $annunciF) -or (Get-Item $annunciF).LastWriteTime -lt (Get-Date).AddHours(-6))) {
        $a = Esegui 'node agente\annunci.js'
        Scrivi $a.Testo
        if ($a.Codice -eq 0) {
            $b = Esegui 'node agente\abbina.js'
            if ($b.Codice -eq 0) { Scrivi $b.Testo }
            $t = Esegui 'node agente\telecamera.js --max 60'
            Scrivi $t.Testo
            $l = Esegui 'node agente\listini.js'
            Scrivi $l.Testo
            $m = Esegui 'node agente\mercato.js'                      # giudizio di AutoScout sul prezzo, per la scheda
            Scrivi $m.Testo
            Pubblica 'Foto e annunci del sito aggiornati' | Out-Null
        }
    }

    # 4. stampa di oggi non ancora arrivata (domenica esclusa)
    if ($ora -ge $OraAllarme -and (Get-Date).DayOfWeek -ne 'Sunday' -and -not (GiaFatto 'allarme')) {
        $giorno = if (Test-Path (Join-Path $repo 'data\stock.json')) { (Get-Content (Join-Path $repo 'data\stock.json') -Raw -Encoding UTF8 | ConvertFrom-Json).meta.day } else { '' }
        if ($giorno -ne $oggi) {
            $p = Esegui 'node agente\posta.js allarme mancante'
            if ($p.Codice -eq 0) { InviaPosta; SegnaStato 'allarme' $oggi; Scrivi 'Avviso inviato: stampa di oggi non ancora arrivata.' }
        }
    }
}
catch {
    $msg = $_.Exception.Message
    Scrivi "Errore: $msg"
    if (-not (GiaFatto 'errore')) {
        try {
            $testo = ($msg -replace '"', "'")
            $p = Esegui "node agente\posta.js allarme errore ""$testo"""
            SegnaStato 'errore' $oggi
            if ($p.Codice -eq 0) { InviaPosta }
        } catch {}
    }
    exit 1
}
