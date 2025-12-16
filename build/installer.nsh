; Custom NSIS installer script for SteamKotakLegends
; This adds custom UI elements and behavior

!macro customHeader
  !system "echo 'Building SteamKotakLegends Installer...'"
!macroend

!macro preInit
  ; Set custom colors
  SetCtlColors $HWNDPARENT 0xFFFFFF 0x1a1a3e
!macroend

!macro customInit
  ; Custom initialization
!macroend

!macro customInstall
  ; Create additional shortcuts or perform custom actions
  CreateShortCut "$DESKTOP\SteamKotakLegends.lnk" "$INSTDIR\SteamKotakLegends.exe"
!macroend

!macro customUnInstall
  ; Clean up on uninstall
  Delete "$DESKTOP\SteamKotakLegends.lnk"
!macroend
