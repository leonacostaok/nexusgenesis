---
name: "web-scraper"
description: "抓取网站网页内容并提取结构化信息。当用户需要获取网页内容、分析网站数据或提取特定信息时调用。"
---

# Web Scraper

## 功能
- 抓取网站网页内容
- 提取结构化信息
- 支持HTML和Markdown格式
- 支持JSON结构化数据提取
- 支持JavaScript渲染的页面

## 使用场景
- 当用户需要获取特定网站的内容时
- 当用户需要分析网站数据时
- 当用户需要提取网页中的特定信息时
- 当用户需要监控网站变化时

## 工具使用

### 抓取单个网页
```json
{
  "name": "mcp_firecrawl-mcp_firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

### 抓取并提取结构化数据
```json
{
  "name": "mcp_firecrawl-mcp_firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/products",
    "formats": ["json"],
    "jsonOptions": {
      "prompt": "提取所有产品的名称、价格和描述",
      "schema": {
        "type": "object",
        "properties": {
          "products": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "price": { "type": "string" },
                "description": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

### 搜索网页
```json
{
  "name": "mcp_firecrawl-mcp_firecrawl_search",
  "arguments": {
    "query": "NexusGenesis blockchain project",
    "limit": 5,
    "sources": [
      { "type": "web" }
    ]
  }
}
```

## 注意事项
- 遵守网站的robots.txt规则
- 不要过度抓取，避免对目标网站造成负担
- 尊重网站的使用条款和版权
- 对于需要登录的网站，可能需要额外的认证信息
- 对于JavaScript渲染的页面，可能需要使用waitFor参数来确保内容完全加载