' Runs start-sumika.bat with no visible console flash at login.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """C:\Other projects\Sumika\start-sumika.bat""", 0, False
