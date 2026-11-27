# Hooks into electron-builder's assisted installer

# The program's colours on the header, welcome and finish pages. Buttons, the window frame and
# the licence, folder and progress controls stay the Windows ones.
!define MUI_BGCOLOR "100F15"
!define MUI_TEXTCOLOR "F0EEF8"

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

# Per user only: skips the "everyone or just me" page, so nothing needs administrator rights
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

# The shortcut names its icon, and the shell is told to read icons again: an update removes the
# exe for a moment, and the desktop would keep showing the blank page it cached then
!macro writeDesktopLink
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0
  WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend

# Installs and updates alike: rewrites a shortcut that is already there, never adds one
!macro customInstall
  ${if} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
    !insertmacro writeDesktopLink
  ${endIf}
!macroend

# The finish page with "Run" and an unticked "desktop shortcut" box
!macro customFinishPage
  Var DesktopLinkText

  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function CreateDesktopLink
    !insertmacro writeDesktopLink
  FunctionEnd

  Function FinishPagePre
    ${if} $LANGUAGE == 1045
      StrCpy $DesktopLinkText "Utwórz skrót na pulpicie"
    ${else}
      StrCpy $DesktopLinkText "Create a desktop shortcut"
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishPageShow
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "$DesktopLinkText"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopLink
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_PAGE_CUSTOMFUNCTION_PRE FinishPagePre
  !insertmacro MUI_PAGE_FINISH

  # After the page, which is what declares its control variables. A themed checkbox ignores the
  # text colour and would be black on the dark background.
  Function FinishPageShow
    StrCpy $0 $mui.FinishPage.Run
    StrCpy $1 $mui.FinishPage.ShowReadme
    System::Call 'uxtheme::SetWindowTheme(p r0, w " ", w " ")'
    System::Call 'uxtheme::SetWindowTheme(p r1, w " ", w " ")'
    SetCtlColors $0 "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
    SetCtlColors $1 "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
  FunctionEnd
!macroend

# Runs before the files are removed, so the program can still be asked to delete its data.
# An update runs the old uninstaller too, and must keep everything.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "league-tracker"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "league-tracker"
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${if} $LANGUAGE == 1045
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Usunąć także historię meczów, kopie zapasowe i ustawienia?$\r$\n$\r$\nTego nie da się cofnąć." /SD IDNO IDNO keepData
    ${else}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete your match history, backups and settings?$\r$\n$\r$\nThis cannot be undone." /SD IDNO IDNO keepData
    ${endif}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --delete-user-data'
    keepData:
  ${endIf}
!macroend
