# Copia di sicurezza di tutto il progetto su Google Drive (cartella sincronizzata G:\Il mio Drive).
# Copia anche i file che NON vanno nel repo pubblico (chiavi, destinatari, rapporti, cache, dati di CROSS):
# Drive e' privato di Giuseppe, il repo no.
#  - progetto\        tutti i file, aggiornati quando cambiano. Non si cancella mai niente: un file tolto dal PC resta nella copia.
#  - repo-git.bundle  tutta la storia git in un solo file (si rifa' solo quando c'e' un commit nuovo)
#  - memoria-claude\  le note che l'assistente tiene sulle preferenze di Giuseppe
# Fuori: node_modules (si riscarica con npm install), video\out (fotogrammi rigenerabili), .git (sta nel bundle).
# Gira alla fine di ogni giro dell'agente (ogni 10 minuti): copia solo quello che e' cambiato, quindi costa pochi secondi.
# Uso a mano: powershell -ExecutionPolicy Bypass -File agente\backup-drive.ps1
param([string]$Destinazione = 'G:\Il mio Drive\lavoro\Gestore stock - copia di sicurezza')

$repo = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Split-Path $Destinazione -Parent))) { Write-Output 'Copia su Drive saltata: Google Drive non e'' collegato.'; exit 0 }
New-Item -ItemType Directory -Force $Destinazione | Out-Null

# 1. file del progetto (robocopy: 0-7 = tutto bene, 8 o piu' = errore)
$esclusi = @((Join-Path $repo 'node_modules'), (Join-Path $repo 'video\node_modules'), (Join-Path $repo 'video\out'), (Join-Path $repo '.git'))
robocopy $repo (Join-Path $Destinazione 'progetto') /E /XD $esclusi /XF '*.tmp' '~$*' /R:1 /W:2 /FFT /NFL /NDL /NJH /NJS /NP | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) { Write-Output "Copia su Drive: errore robocopy $rc"; exit 1 }

# 2. storia git in un file solo, solo se c'e' un commit nuovo
$ultimo = Join-Path $Destinazione 'ultimo-commit.txt'
$head = (cmd /c "git -C ""$repo"" rev-parse HEAD 2>nul").Trim()
if ($head -and (-not (Test-Path $ultimo) -or (Get-Content $ultimo -Raw).Trim() -ne $head)) {
    $tmp = Join-Path $env:TEMP 'gestore-stock.bundle'
    cmd /c "git -C ""$repo"" bundle create ""$tmp"" --all 2>nul" | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Copy-Item $tmp (Join-Path $Destinazione 'repo-git.bundle') -Force
        Remove-Item $tmp -Force
        Set-Content $ultimo $head -Encoding ASCII
    }
}

# 3. note dell'assistente (preferenze e regole di Giuseppe)
$memoria = Join-Path $env:USERPROFILE '.claude\projects\C--Users-Venditore32-Documents-Gestore-stock\memory'
if (Test-Path $memoria) { robocopy $memoria (Join-Path $Destinazione 'memoria-claude') /E /R:1 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null }

$cambiati = if ($rc -band 1) { 'file aggiornati' } else { 'niente di nuovo' }
Write-Output "Copia su Drive: $cambiati."
exit 0
