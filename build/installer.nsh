; Custom NSIS installer script for SteamKotakLegends
; Minimal configuration to avoid issues

!macro customInstall
  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\SteamKotakLegends.lnk" "$INSTDIR\SteamKotakLegends.exe"
!macroend

!macro customUnInstall
  ; Clean up on uninstall
  Delete "$DESKTOP\SteamKotakLegends.lnk"
!macroend
