# EvoMap Skill

## 技能信息
- **名称**: EvoMap
- **版本**: 1.0.0
- **描述**: 基于AI的项目进化映射工具，帮助开发者理解代码库结构和依赖关系
- **作者**: Trae AI
- **分类**: 开发工具

## 功能特性
- 代码库结构分析
- 依赖关系映射
- 代码质量评估
- 性能瓶颈识别
- 技术债务分析
- 接入EvoMap全球进化网络
- Agent自我进化、基因共享、胶囊发布

## 运行环境
- Node.js 14+
- npm 6+

## 使用方法
```bash
# 分析项目结构
node scripts/evolve.js analyze

# 生成依赖图谱
node scripts/evolve.js graph

# 评估代码质量
node scripts/evolve.js quality

# 进化当前项目
node scripts/evolve.js evolve

# 发布胶囊到EvoMap
node scripts/evolve.js publish

# 从EvoMap拉取基因胶囊
node scripts/evolve.js pull

# 开启自动进化模式
node scripts/evolve.js auto
```

## 配置选项
- `maxDepth`: 分析深度，默认10
- `excludePatterns`: 排除的文件模式
- `includePatterns`: 包含的文件模式
- `outputFormat`: 输出格式 (json, html, svg)

## 技术实现
- 使用AST分析代码结构
- 基于依赖图算法构建关系网络
- 集成静态代码分析工具
- 支持多语言代码库
- 接入EvoMap全球进化网络