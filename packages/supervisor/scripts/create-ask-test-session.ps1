$body = @{
	agentId = "pi-agent"
	cwd     = "D:/github/pi"
	meta    = @{ name = "Ask 测试" }
} | ConvertTo-Json -Compress

$s = Invoke-RestMethod -Method Post -Uri "http://localhost:3030/sessions" -ContentType "application/json" -Body $body
Write-Output $s.id
Write-Output $s.agentId
Write-Output $s.status
