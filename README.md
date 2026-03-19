# APP Version Manager

一个 Obsidian 插件，用于管理 APP 版本规划和关联的项目信息。

## 功能特性

### 多 APP 管理
- 创建、重命名、删除 APP
- 每个 APP 可包含多个版本

### 版本管理
- 创建版本（包含 APP版本号、BLL版本、IPP版本、Web版本）
- 版本归档/取消归档
- 删除版本

### 项目管理
- 创建项目并关联到版本
- 项目属性：名称、项目经理、项目链接、组件库链接、需求描述
- 项目进度跟踪（6 个阶段）
- 计划提测时间、计划发布时间、实际发布时间
- 逾期提醒（红色标记）

### 多视图展示
- **双栏视图**: 左侧版本列表，右侧项目列表
- **看板视图**: 按进度分列的看板形式
- **表格视图**: 传统表格形式

### 项目备忘录
- 双击项目卡片打开独立的备忘录文件
- 备忘录与项目配置完全隔离存储
- 可自由记录项目相关信息

### 筛选与搜索
- 按进度筛选
- 关键词搜索（项目名称、项目经理、需求）
- 保存筛选条件

### 数据导入导出
- 导出为 CSV / Excel 格式
- 从 CSV / Excel 导入数据

### 自动备份
- 可配置自动备份（默认每周五 23:00）
- 保留最近 10 个备份
- 支持从备份恢复

## 项目进度阶段

```
需求分解 → 配置组件填写 → 组件上传 → 自测验证 → 已提测 → 已发布
```

## 快捷键

- `Ctrl+Shift+V` - 打开 APP Version Manager
- `Ctrl+Shift+N` - 创建新版本
- `Ctrl+Alt+N` - 创建新项目

## 数据存储

所有数据以 Markdown 文件形式存储在 Obsidian vault 的 `app-version-manager/` 目录下：

```
app-version-manager/
├── apps/        # APP 数据
├── versions/    # 版本数据
├── projects/    # 项目数据
├── memos/       # 项目备忘录
└── backups/     # 备份数据
```

## 安装

### 手动安装
1. 下载 `main.js`、`manifest.json` 文件
2. 在 Obsidian vault 中创建 `.obsidian/plugins/obsidian-app-version-manager/` 目录
3. 将下载的文件放入该目录
4. 重启 Obsidian 并在设置中启用插件

### 开发构建
```bash
npm install
npm run build
```

## 开发

```bash
# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

## 许可证

MIT
