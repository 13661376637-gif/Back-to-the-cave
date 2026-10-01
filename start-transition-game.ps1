$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8790
$runtimePython = "C:\Users\shang\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$runtimeNode = "C:\Users\shang\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$navigateTool = Join-Path $projectRoot "tools\navigate-quest-game.mjs"
$pythonCommand = $runtimePython
$pythonArgs = @("-m", "http.server", "$port", "--bind", "127.0.0.1")

if (-not (Test-Path -LiteralPath $pythonCommand)) {
  $fallbackPython = Get-Command python -ErrorAction SilentlyContinue
  if ($fallbackPython) {
    $pythonCommand = $fallbackPython.Source
  } else {
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if (-not $pythonLauncher) {
      throw "Python was not found. Install Python or open this project from an existing local web server."
    }
    $pythonCommand = $pythonLauncher.Source
    $pythonArgs = @("-3", "-m", "http.server", "$port", "--bind", "127.0.0.1")
  }
}

$url = "http://127.0.0.1:$port/play-vr-controller-v14.html?build=controller-v38"
$questAdb = "E:\quest VR\QuestTool\data\flutter_assets\assets\plugin\adb\windows\adb.exe"

function Test-PageReady {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -eq 200 -and $response.Content -match '<canvas id="space"'
  } catch {
    return $false
  }
}

if (-not (Test-PageReady)) {
  Start-Process -FilePath $pythonCommand -ArgumentList $pythonArgs -WorkingDirectory $projectRoot -WindowStyle Hidden
}

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  if (Test-PageReady) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 250
}

if (-not $ready) {
  throw "The local preview server did not become available at $url"
}

$questConnected = $false
if (Test-Path -LiteralPath $questAdb) {
  $questStateOutput = & $questAdb get-state 2>$null
  $questState = if ($questStateOutput) { ([string]$questStateOutput).Trim() } else { "" }
  if ($questState -eq "device") {
    $questConnected = $true
    & $questAdb reverse tcp:$port tcp:$port | Out-Null
    & $questAdb shell am force-stop com.oculus.browser | Out-Null
    Start-Sleep -Milliseconds 300
    & $questAdb shell am start -n com.oculus.browser/.BrowserChromeActivity -a android.intent.action.VIEW -d $url | Out-Null
    & $questAdb forward tcp:9222 localabstract:chrome_devtools_remote | Out-Null
    Start-Sleep -Milliseconds 700
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:9222/json" -TimeoutSec 3
      $target = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1
      if ($target.webSocketDebuggerUrl -and (Test-Path -LiteralPath $runtimeNode) -and (Test-Path -LiteralPath $navigateTool)) {
        & $runtimeNode $navigateTool $target.webSocketDebuggerUrl $url | Out-Null
      }
    } catch {
      Write-Output "Quest browser opened; automatic URL verification was unavailable."
    }
    Write-Output "Quest 3 connected. USB preview opened at $url"
  } else {
    Write-Output "Quest 3 not ready. Open $url after connecting the headset."
  }
}

if (-not $questConnected) {
  try {
    Start-Process $url -ErrorAction Stop
  } catch {
    Write-Output "Local preview is ready at $url"
  }
}
