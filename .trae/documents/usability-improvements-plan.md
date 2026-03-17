# 易用性改进实施计划

## 问题分析

### 问题1：看板视图和表格视图仅显示当前选择的版本下面的项目
**根因**：`AppVersionManagerView.ts` 的 `getFilteredProjects()` 方法会根据 `selectedVersionId` 过滤项目，而看板和表格视图使用的是过滤后的项目列表。

**涉及文件**：[AppVersionManagerView.ts](file:///e:\Code\glm_5\src\view\AppVersionManagerView.ts)

### 问题2：编辑操作改成双击触发，删除改成删除按钮
**现状**：
- 看板视图：已有双击编辑，删除在右键菜单中
- 表格视图：编辑是按钮点击，删除是按钮点击
- 双栏视图：编辑和删除都在右键菜单中

**涉及文件**：
- [KanbanView.ts](file:///e:\Code\glm_5\src\view\KanbanView.ts)
- [TableView.ts](file:///e:\Code\glm_5\src\view\TableView.ts)
- [DualPaneView.ts](file:///e:\Code\glm_5\src\view\DualPaneView.ts)

### 问题3：版本下面显示"0个项目"，但实际选中后会显示正确的项目数
**根因**：`DualPaneView` 接收的 `projects` 参数是已经按版本过滤后的项目列表，导致计算项目数时其他版本显示为0。

**涉及文件**：[AppVersionManagerView.ts](file:///e:\Code\glm_5\src\view\AppVersionManagerView.ts)

---

## 实施步骤

### 步骤1：修复版本项目数显示问题（问题3）
**文件**：`AppVersionManagerView.ts`

**修改内容**：
1. 在 `renderMainView()` 方法中，为双栏视图传递未按版本过滤的项目列表
2. 创建新方法 `getAppFilteredProjects()` 仅按APP过滤项目

**代码修改位置**：第247-291行的 `renderMainView()` 方法

```typescript
private renderMainView() {
  this.mainEl.empty();
  
  // 仅按APP过滤的项目列表（用于看板、表格视图和双栏视图的项目计数）
  const appFilteredProjects = this.getAppFilteredProjects();
  // 按版本过滤的项目列表（仅用于双栏视图的项目列表显示）
  const versionFilteredProjects = this.getFilteredProjects();
  const filteredVersions = this.selectedAppId 
    ? this.versions.filter(v => v.appId === this.selectedAppId)
    : [];
  
  switch (this.currentView) {
    case 'dual':
      new DualPaneView(
        this.mainEl,
        this.plugin,
        filteredVersions,
        appFilteredProjects,  // 传递所有APP下的项目用于计数
        this.selectedVersionId,
        (versionId) => {
          this.selectedVersionId = versionId;
          this.render();
        },
        () => this.showCreateVersionModal(),
        () => this.showCreateProjectModal(),
        () => this.refresh()
      );
      break;
    case 'kanban':
      new KanbanView(
        this.mainEl,
        this.plugin,
        appFilteredProjects,  // 显示所有APP下的项目
        filteredVersions,
        () => this.refresh()
      );
      break;
    case 'table':
      new TableView(
        this.mainEl,
        this.plugin,
        appFilteredProjects,  // 显示所有APP下的项目
        filteredVersions,
        () => this.refresh()
      );
      break;
  }
}

// 新增方法：仅按APP过滤项目
private getAppFilteredProjects(): Project[] {
  let projects = this.projects;
  
  if (this.selectedAppId) {
    const appVersionIds = this.versions
      .filter(v => v.appId === this.selectedAppId)
      .map(v => v.id);
    projects = projects.filter(p => appVersionIds.includes(p.versionId));
  }
  
  // 应用进度和关键词过滤
  if (this.currentFilter.progress) {
    projects = projects.filter(p => p.progress === this.currentFilter.progress);
  }
  
  if (this.currentFilter.keyword) {
    const keyword = this.currentFilter.keyword.toLowerCase();
    projects = projects.filter(p =>
      p.name.toLowerCase().includes(keyword) ||
      p.manager.toLowerCase().includes(keyword) ||
      p.requirements.toLowerCase().includes(keyword)
    );
  }
  
  return projects;
}
```

### 步骤2：修改表格视图的编辑触发方式（问题2）
**文件**：`TableView.ts`

**修改内容**：
1. 移除操作列中的编辑按钮
2. 添加行双击事件触发编辑
3. 保留删除按钮

**代码修改位置**：
- 第38-48行：移除操作列中的编辑按钮相关代码
- 第138-152行：修改操作列只保留删除按钮
- 第156-159行：添加行双击事件

```typescript
// 修改列定义，移除编辑按钮
case 'actions':
  const actionsContainer = td.createDiv({ cls: 'avm-cell-actions' });
  
  // 只保留删除按钮
  const deleteBtn = actionsContainer.createEl('button', { cls: 'avm-btn-small avm-btn-danger', text: '🗑️' });
  deleteBtn.addEventListener('click', async () => {
    const confirmed = confirm(`确定要删除项目 "${project.name}" 吗？`);
    if (confirmed) {
      await this.plugin.dataService.deleteProject(project.id);
      this.onRefresh();
    }
  });
  break;

// 添加行双击事件（在现有代码后添加）
row.addEventListener('dblclick', () => {
  this.showEditProjectModal(project);
});
```

### 步骤3：修改双栏视图的编辑和删除操作（问题2）
**文件**：`DualPaneView.ts`

**修改内容**：
1. 为项目项添加双击编辑功能
2. 在项目项上添加删除按钮

**代码修改位置**：第195-257行的 `renderProjectItem()` 方法

```typescript
private renderProjectItem(container: HTMLElement, project: Project) {
  const item = container.createDiv({ cls: 'avm-project-item' });
  
  const header = item.createDiv({ cls: 'avm-project-header' });
  header.createDiv({ cls: 'avm-project-name', text: project.name });
  
  // 添加删除按钮到header
  const deleteBtn = header.createEl('button', { cls: 'avm-btn-small avm-btn-danger', text: '🗑️' });
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = confirm(`确定要删除项目 "${project.name}" 吗？`);
    if (confirmed) {
      await this.plugin.dataService.deleteProject(project.id);
      this.onRefresh();
    }
  });
  
  // ... 其余代码保持不变 ...
  
  // 添加双击编辑
  item.addEventListener('dblclick', () => {
    this.showEditProjectModal(project);
  });
  
  // 保留右键菜单
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    this.showProjectContextMenu(project, e);
  });
}
```

### 步骤4：修改看板视图的删除操作（问题2）
**文件**：`KanbanView.ts`

**修改内容**：
1. 在卡片上添加删除按钮
2. 保留双击编辑功能
3. 保留右键菜单

**代码修改位置**：第62-120行的 `renderCard()` 方法

```typescript
private renderCard(container: HTMLElement, project: Project) {
  const card = container.createDiv({ cls: 'avm-kanban-card' });
  
  // ... 现有代码 ...
  
  const header = card.createDiv({ cls: 'avm-card-header' });
  header.createDiv({ cls: 'avm-card-title', text: project.name });
  
  // 添加删除按钮
  const deleteBtn = header.createEl('button', { cls: 'avm-card-delete-btn', text: '🗑️' });
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const confirmed = confirm(`确定要删除项目 "${project.name}" 吗？`);
    if (confirmed) {
      await this.plugin.dataService.deleteProject(project.id);
      this.onRefresh();
    }
  });
  
  // ... 其余代码保持不变 ...
  
  // 保留双击编辑
  card.addEventListener('dblclick', () => {
    this.showEditProjectModal(project);
  });
  
  // 保留右键菜单
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    this.showCardContextMenu(project, e);
  });
}
```

---

## 修改文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `AppVersionManagerView.ts` | 修改 | 新增 `getAppFilteredProjects()` 方法，修改 `renderMainView()` 方法 |
| `TableView.ts` | 修改 | 移除编辑按钮，添加行双击编辑，保留删除按钮 |
| `DualPaneView.ts` | 修改 | 添加项目双击编辑，添加删除按钮 |
| `KanbanView.ts` | 修改 | 添加删除按钮到卡片header |

---

## 验证要点

1. **看板视图**：显示所有APP下的项目，不受版本选择影响
2. **表格视图**：显示所有APP下的项目，双击行编辑，删除按钮删除
3. **双栏视图**：版本列表正确显示项目数量，项目项支持双击编辑和删除按钮
4. **版本项目数**：所有版本都正确显示其下的项目数量
