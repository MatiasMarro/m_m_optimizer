; ============================================================
;  m_m_optimizer-cnc — Inno Setup Script
;  Genera: installer\output\setup_m_m_optimizer_v0.5.0.exe
;
;  Requiere: Inno Setup 6+ (https://jrsoftware.org/isinfo.php)
;  Compilar: iscc installer\m_m_optimizer.iss
;            (o abrir este archivo en el IDE de Inno Setup)
;
;  El script espera que PyInstaller ya haya corrido y exista:
;    dist\m_m_optimizer\m_m_optimizer.exe
; ============================================================

#define AppName      "m_m_optimizer-cnc"
#define AppVersion   "0.5.0"
#define AppPublisher "Matías Marro"
#define AppExeName   "m_m_optimizer.exe"
#define AppURL       "https://github.com/MatiasMarro/m_m_optimizer"

[Setup]
AppId={{6F3A2D1E-8B4C-4F7A-9C2E-1D5F8A3B6E9C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
AppCopyright=Copyright (C) 2024-2026 Matías Marro. All rights reserved.

; Directorio de instalación: Archivos de programa del usuario (no requiere admin)
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=no

; Icono del instalador (descomentar si se agrega assets\icon.ico)
; SetupIconFile=..\assets\icon.ico

; Salida
OutputDir=output
OutputBaseFilename=setup_{#AppName}_v{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
InternalCompressLevel=ultra64

; No requiere reinicio
RestartIfNeededByRun=no

; Permite instalar sin privilegios de administrador
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline dialog

; Versión mínima de Windows: 10
MinVersion=10.0

; Arquitectura
ArchitecturesInstallIn64BitMode=x64compatible

; Mostrar licencia durante instalación
LicenseFile=..\LICENSE

; Wizard style moderno
WizardStyle=modern

; Idioma
ShowLanguageDialog=no

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon";    Description: "Crear acceso directo en el &Escritorio";    GroupDescription: "Accesos directos:"; Flags: checkedonce
Name: "startmenuicon";  Description: "Crear acceso directo en el men&ú Inicio";  GroupDescription: "Accesos directos:"; Flags: checkedonce

[Files]
; Todos los archivos generados por PyInstaller
Source: "..\dist\m_m_optimizer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Menú Inicio
Name: "{group}\{#AppName}";             Filename: "{app}\{#AppExeName}"; Comment: "Optimizador CNC para carpintería"
Name: "{group}\Desinstalar {#AppName}"; Filename: "{uninstallexe}"

; Escritorio (solo si la tarea fue seleccionada)
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Comment: "Optimizador CNC para carpintería"; Tasks: desktopicon

[Run]
; Ofrecer abrir la app al terminar la instalación
Filename: "{app}\{#AppExeName}"; Description: "Abrir {#AppName} ahora"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; No borrar los datos del usuario al desinstalar (proyectos, config)
; Si se quiere borrarlos también, agregar:
; Type: filesandordirs; Name: "{userappdata}\{#AppName}"

[Code]
// Verificar si ya existe una versión instalada y sugerir desinstalar primero
function InitializeSetup(): Boolean;
var
  sUninstPath: String;
  sUninstallString: String;
  iResultCode: Integer;
begin
  Result := True;
  sUninstPath := ExpandConstant('Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1');
  sUninstallString := '';
  if not RegQueryStringValue(HKLM, sUninstPath, 'UninstallString', sUninstallString) then
    RegQueryStringValue(HKCU, sUninstPath, 'UninstallString', sUninstallString);

  if sUninstallString <> '' then begin
    if MsgBox(
      '{#AppName} ya está instalado.' + #13#10 +
      'Se recomienda desinstalarlo antes de continuar.' + #13#10#13#10 +
      '¿Desinstalarlo ahora?',
      mbConfirmation, MB_YESNO) = IDYES
    then begin
      Exec(RemoveQuotes(sUninstallString), '/SILENT /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, iResultCode);
    end;
  end;
end;
