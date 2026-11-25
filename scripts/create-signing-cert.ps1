#Requires -Version 7
# Creates a self-signed code signing certificate for electron-builder (CSC_LINK / CSC_KEY_PASSWORD).
# Self-signed: the exe carries a signature, but Windows does not trust it on any machine by default.
# Run once. With -UploadToGitHub it also stores both values as GitHub Actions secrets.
param(
    [string]$Path = (Join-Path $HOME '.rift-records\signing.pfx'),
    [securestring]$Password,
    [switch]$UploadToGitHub
)
$ErrorActionPreference = 'Stop'

# A new certificate is a new identity, so never replace one silently.
if (Test-Path $Path) { throw "$Path already exists. Delete it yourself to make a new certificate." }
if (-not $Password) { $Password = Read-Host 'Password for the new certificate' -AsSecureString }
$plain = ConvertFrom-SecureString $Password -AsPlainText
if (-not $plain) { throw 'The password must not be empty.' }

$x = 'System.Security.Cryptography.X509Certificates'
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$request = New-Object "$x.CertificateRequest" 'CN=dxmegg', $rsa, 'SHA256', ([System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$usage = [System.Security.Cryptography.OidCollection]::new()
[void]$usage.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3')) # code signing
$request.CertificateExtensions.Add((New-Object "$x.X509EnhancedKeyUsageExtension" $usage, $true))
$cert = $request.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddYears(5))

New-Item -ItemType Directory -Force (Split-Path $Path) | Out-Null
[IO.File]::WriteAllBytes($Path, $cert.Export('Pfx', $plain))
"Certificate written to $Path"

if ($UploadToGitHub) {
    [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path)) | gh secret set CSC_LINK
    if ($LASTEXITCODE) { throw 'gh secret set CSC_LINK failed.' }
    $plain | gh secret set CSC_KEY_PASSWORD
    if ($LASTEXITCODE) { throw 'gh secret set CSC_KEY_PASSWORD failed.' }
}
