@echo off
setlocal
cd /d "%~dp0"

echo ======================================================================
echo                  MachinaPay — Stopping Demo Services
echo ======================================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(8545, 4000, 5173, 5174); " ^
  "foreach ($p in $ports) { " ^
  "  $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue; " ^
  "  if ($conns) { " ^
  "    foreach ($c in $conns) { " ^
  "      $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; " ^
  "      if ($proc) { " ^
  "        Write-Host \"[INFO] Stopping process $($proc.ProcessName) (PID $($proc.Id)) on port $p...\"; " ^
  "        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; " ^
  "      } " ^
  "    } " ^
  "  } " ^
  "}"

echo.
echo [SUCCESS] All MachinaPay services on ports 8545, 4000, 5173, and 5174 stopped.
echo You may now close any remaining idle cmd windows.
echo ======================================================================
