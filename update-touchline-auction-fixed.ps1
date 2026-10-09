$ErrorActionPreference = "Stop"

# Run this script from the TOUCHLINE project folder, or pass the folder path:
# powershell -ExecutionPolicy Bypass -File .\update-touchline-auction.ps1 "C:\path\to\football-auction-simulator"

$Project = if ($args.Count -gt 0 -and $args[0]) { $args[0] } else { (Get-Location).Path }
$GamePath = Join-Path $Project "lib\game.js"
$ServerPath = Join-Path $Project "server.js"
$AppPath = Join-Path $Project "public\app.js"

foreach ($path in @($GamePath, $ServerPath, $AppPath)) {
    if (-not (Test-Path $path)) { throw "Required file not found: $path`nRun this script from your TOUCHLINE project folder or pass its path." }
}

# Keep backups so the changes can be reversed if needed.
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $GamePath "$GamePath.$stamp.bak"
Copy-Item $ServerPath "$ServerPath.$stamp.bak"
Copy-Item $AppPath "$AppPath.$stamp.bak"

# 1) Let bidding start at €0M, with each next bid increasing by €1M.
$game = [System.IO.File]::ReadAllText($GamePath)
$oldRule = '  if(!Number.isFinite(amount) || amount < Math.max(player.price,room.highestBid+1)) return {ok:false,reason:`Minimum bid is €${Math.max(player.price,room.highestBid+1)}M`};'
$newRule = @'
  const minimumBid = room.highestBid + 1;
  if(!Number.isFinite(amount) || amount < minimumBid) return {ok:false,reason:`Minimum bid is €${minimumBid}M`};
'@
$newRule = $newRule.TrimEnd()
if ($game.Contains($oldRule)) {
    $game = $game.Replace($oldRule, $newRule)
} elseif (-not $game.Contains('const minimumBid = room.highestBid + 1;')) {
    throw "Could not find the expected canBid rule in lib\game.js. No further changes were made. Restore from the .bak files if necessary."
}
[System.IO.File]::WriteAllText($GamePath, $game, [System.Text.UTF8Encoding]::new($false))

# 2) Set reference values and the auction timer to six seconds.
$server = [System.IO.File]::ReadAllText($ServerPath)
$oldPlayer = '    room.currentPlayer = player;'
$newPlayer = @'
    const baseBid = player.rating >= 90 ? 30 : player.rating >= 85 ? 20 : 15;
    room.currentPlayer = { ...player, baseBid };
'@
$newPlayer = $newPlayer.TrimEnd()
if ($server.Contains($oldPlayer)) {
    $server = $server.Replace($oldPlayer, $newPlayer)
} elseif (-not $server.Contains('const baseBid = player.rating >= 90 ? 30 : player.rating >= 85 ? 20 : 15;')) {
    throw "Could not find the expected player assignment in server.js."
}
$server = $server.Replace('room.endsAt = Date.now() + 15000;', 'room.endsAt = Date.now() + 6000;')
$server = $server.Replace('room.endsAt = Date.now() + 12000;', 'room.endsAt = Date.now() + 6000;')
[System.IO.File]::WriteAllText($ServerPath, $server, [System.Text.UTF8Encoding]::new($false))

# 3) Update the auction UI so the displayed current bid is €0M at the start,
# show the player's reference value separately, and use the €1M next increment.
$app = [System.IO.File]::ReadAllText($AppPath)
$oldUI = '<div class="price-row"><div><span class="muted">CURRENT BID</span><strong>${money(state.auction.highestBid||p.price)}</strong><small class="muted">${state.auction.highestBidder?`Highest bidder: ${esc(state.teams.find(t=>t.id===state.auction.highestBidder)?.manager||"Manager")}`:"Starting price"}</small></div><div style="text-align:right"><span class="muted">TIME LEFT</span><div class="timer" id="timer">00:15</div></div></div><div class="bid-row"><input id="bidAmount" type="number" min="${Math.max(p.price,state.auction.highestBid+1)}" max="${mine?.budget||0}" step="1" value="${Math.min(mine?.budget||p.price,Math.max(p.price,state.auction.highestBid+1))}"><button class="green-btn" data-action="bid" ${!mine||mine.budget<Math.max(p.price,state.auction.highestBid+1)||state.auction.highestBidder===myTeamId?"disabled":""}>PLACE BID ↗</button></div><p class="muted">Minimum bid ${money(Math.max(p.price,state.auction.highestBid+1))} · Your budget ${money(mine?.budget||0)}</p>'
$newUI = '<div class="price-row"><div><span class="muted">CURRENT BID</span><strong>${money(state.auction.highestBid)}</strong><small class="muted">Player reference value: ${money(p.baseBid||15)} · ${state.auction.highestBidder?`Highest bidder: ${esc(state.teams.find(t=>t.id===state.auction.highestBidder)?.manager||"Manager")}`:"Bidding starts at €0M"}</small></div><div style="text-align:right"><span class="muted">TIME LEFT</span><div class="timer" id="timer">00:06</div></div></div><div class="bid-row"><input id="bidAmount" type="number" min="${state.auction.highestBid+1}" max="${mine?.budget||0}" step="1" value="${Math.min(mine?.budget||0,state.auction.highestBid+1)}"><button class="green-btn" data-action="bid" ${!mine||mine.budget<state.auction.highestBid+1||state.auction.highestBidder===myTeamId?"disabled":""}>PLACE BID ↗</button></div><p class="muted">Next bid ${money(state.auction.highestBid+1)} · Your budget ${money(mine?.budget||0)}</p>'
if ($app.Contains($oldUI)) {
    $app = $app.Replace($oldUI, $newUI)
} elseif (-not $app.Contains('Bidding starts at €0M')) {
    throw "Could not find the expected auction display in public\app.js."
}
[System.IO.File]::WriteAllText($AppPath, $app, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "TOUCHLINE auction changes applied." -ForegroundColor Green
Write-Host " - All players start bidding at €0M."
Write-Host " - Reference values: rating 90+ = €30M; rating 85-89 = €20M; others = €15M."
Write-Host " - Minimum bid increment = €1M."
Write-Host " - Auction timer = 6 seconds, reset after each valid bid."
Write-Host ""
Write-Host "Next, run:"
Write-Host "  npm test"
Write-Host "  npm start"
Write-Host ""
Write-Host "Backups were created next to the three updated files with timestamp $stamp."
