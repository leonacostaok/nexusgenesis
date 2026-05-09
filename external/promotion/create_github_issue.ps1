# NexusGenesis GitHub 推广脚本
# 使用 GitHub CLI 创建推广 Issue

Write-Host "创建 NexusGenesis 推广 Issue..."
Write-Host "=================================="

# 检查 GitHub CLI 是否安装
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "错误: GitHub CLI 未安装" -ForegroundColor Red
    Write-Host "请访问 https://cli.github.com/ 安装 GitHub CLI" -ForegroundColor Yellow
    exit 1
}

# 检查是否已登录
try {
    gh auth status | Out-Null
} catch {
    Write-Host "请使用 'gh auth login' 登录 GitHub" -ForegroundColor Yellow
    exit 1
}

# 设置仓库
$REPO = "NexusGenesisAI/NexusGenesis"

# 读取 Issue 内容
$body = Get-Content -Path "d:\trae_projects\NexusGenesis\promotion\github_issue.md" -Raw

# 创建 Issue
Write-Host "创建推广 Issue..."
gh issue create --repo "$REPO" --title "🌟 NexusGenesis - AI 原生抗量子链 🌟" --body "$body" --label "promotion" --label "announcement"

Write-Host "=================================="
Write-Host "GitHub Issue 创建完成！" -ForegroundColor Green
Write-Host "请访问: https://github.com/NexusGenesisAI/NexusGenesis/issues" -ForegroundColor Cyan