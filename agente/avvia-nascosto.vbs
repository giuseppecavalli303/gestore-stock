' Lancia l'agente senza far comparire finestre: e' questo il file che l'operazione pianificata di Windows esegue.
Dim cartella
cartella = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & cartella & "\aggiorna-stock.ps1""", 0, False
