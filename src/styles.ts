export const STYLES = `
.app-version-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
  font-size: 14px;
}

.avm-header {
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.avm-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.avm-app-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.avm-app-actions {
  display: flex;
  gap: 4px;
}

.avm-view-switcher {
  display: flex;
  gap: 4px;
}

.avm-view-btn-active {
  background: var(--interactive-accent) !important;
  color: var(--text-on-accent) !important;
}

.avm-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.avm-filter-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.avm-filter-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.avm-filter-item select,
.avm-filter-item input {
  padding: 4px 8px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 12px;
}

.avm-filter-item select:focus,
.avm-filter-item input:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.avm-filter-item input {
  min-width: 120px;
}

.avm-search-input {
  flex: 1;
  min-width: 150px;
  padding: 6px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
}

.avm-search-input:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.avm-select {
  padding: 6px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 13px;
  cursor: pointer;
}

.avm-select:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.avm-saved-filter {
  min-width: 120px;
}

.avm-filter-actions {
  display: flex;
  gap: 4px;
}

.avm-action-buttons {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.avm-main {
  flex: 1;
  overflow: hidden;
}

.avm-dual-pane {
  display: flex;
  height: 100%;
}

.avm-left-pane {
  width: 280px;
  border-right: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  background: var(--background-secondary);
}

.avm-right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.avm-pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.avm-pane-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.avm-version-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.avm-version-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background-color 0.15s;
}

.avm-version-item:hover {
  background: var(--background-modifier-hover);
}

.avm-version-item.avm-selected {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.avm-version-item.avm-archived {
  opacity: 0.6;
}

.avm-version-number {
  font-weight: 600;
  font-size: 13px;
}

.avm-version-meta {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

.avm-archived-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-top: 12px;
  border-top: 1px solid var(--background-modifier-border);
}

.avm-project-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.avm-project-item {
  padding: 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--background-primary);
}

.avm-project-item.avm-overdue {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.avm-project-item.avm-highlighted-row {
  border-color: #ef4444;
  border-width: 2px;
  background: rgba(239, 68, 68, 0.08);
}

.avm-project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.avm-project-name {
  font-weight: 600;
  font-size: 14px;
}

.avm-progress-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: white;
  font-weight: 500;
}

.avm-progress-badge-small {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  color: white;
  font-weight: 500;
  display: inline-block;
}

.avm-clickable {
  cursor: pointer;
  transition: transform 0.1s, opacity 0.1s;
}

.avm-clickable:hover {
  opacity: 0.8;
  transform: scale(1.05);
}

.avm-progress-confirm-modal .avm-confirm-info {
  padding: 16px 0;
}

.avm-progress-confirm-modal .avm-confirm-project {
  font-size: 14px;
  margin-bottom: 20px;
  padding: 12px;
  background: var(--background-secondary);
  border-radius: 8px;
}

.avm-progress-confirm-modal .avm-confirm-label {
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.avm-progress-confirm-modal .avm-confirm-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 16px 0;
}

.avm-progress-confirm-modal .avm-progress-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avm-progress-confirm-modal .avm-progress-arrow {
  font-size: 24px;
  color: var(--text-muted);
}

.avm-project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.avm-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.avm-overdue-text {
  color: #ef4444;
  font-weight: 500;
}

.avm-project-links {
  display: flex;
  gap: 12px;
}

.avm-link {
  color: var(--interactive-accent);
  text-decoration: none;
  font-size: 12px;
  cursor: pointer;
}

.avm-link:hover {
  text-decoration: underline;
}

.avm-link-small {
  color: var(--interactive-accent);
  text-decoration: none;
  font-size: 11px;
  cursor: pointer;
  margin-right: 8px;
}

.avm-link-small:hover {
  text-decoration: underline;
}

.avm-project-requirements {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--background-modifier-border);
}

.avm-empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
  font-size: 13px;
}

/* Kanban View */
.avm-kanban {
  display: flex;
  height: 100%;
  overflow-x: auto;
  padding: 12px;
  gap: 12px;
}

.avm-kanban-column {
  min-width: 250px;
  max-width: 300px;
  background: var(--background-secondary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.avm-kanban-column-header {
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.avm-kanban-column-title {
  font-weight: 600;
  font-size: 13px;
}

.avm-kanban-column-count {
  background: var(--background-modifier-border);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--text-muted);
}

.avm-kanban-column-indicator {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  margin-left: auto;
}

.avm-kanban-cards {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.avm-kanban-empty {
  text-align: center;
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
}

.avm-kanban-card {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.avm-kanban-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.avm-kanban-card.avm-overdue {
  border-color: #ef4444;
}

.avm-kanban-card.avm-highlighted-row {
  border-color: #ef4444;
  border-width: 2px;
  background: rgba(239, 68, 68, 0.05);
}

.avm-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 6px;
}

.avm-card-title {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
}

.avm-card-version {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--background-modifier-border);
  padding: 2px 6px;
  border-radius: 4px;
}

.avm-card-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.avm-card-links {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

/* Table View */
.avm-table-view {
  height: 100%;
  overflow: auto;
}

.avm-table-wrapper {
  min-width: 100%;
}

.avm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.avm-table th {
  text-align: left;
  padding: 12px;
  background: var(--background-secondary);
  border-bottom: 2px solid var(--background-modifier-border);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.avm-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  vertical-align: middle;
}

.avm-table tr:hover {
  background: var(--background-modifier-hover);
}

.avm-table tr.avm-overdue-row {
  background: rgba(239, 68, 68, 0.05);
}

.avm-table tr.avm-overdue-row:hover {
  background: rgba(239, 68, 68, 0.1);
}

.avm-table tr.avm-highlighted-row {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid #ef4444;
}

.avm-table tr.avm-highlighted-row:hover {
  background: rgba(239, 68, 68, 0.15);
}

.avm-cell-name {
  font-weight: 500;
}

.avm-cell-links {
  display: flex;
  gap: 8px;
}

.avm-cell-actions {
  display: flex;
  gap: 4px;
}

.avm-btn-small {
  padding: 4px 8px;
  border: none;
  background: var(--background-modifier-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.avm-btn-small:hover {
  background: var(--background-modifier-hover);
}

.avm-btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

/* Icon button */
.avm-btn-icon {
  padding: 4px 6px !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.avm-btn-icon:hover {
  background: var(--background-modifier-hover) !important;
  color: var(--text-normal);
}

/* Modal */
.avm-modal {
  padding: 20px;
}

.avm-modal h2 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 18px;
}

.avm-modal .setting-item-control input[type="text"],
.avm-modal .setting-item-control textarea,
.avm-modal .setting-item-control select {
  width: 280px;
}

.avm-modal .setting-item-control textarea {
  min-height: 60px;
  resize: vertical;
}

.avm-modal-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

/* Tab Bar */
.avm-tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.avm-tab {
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.avm-tab:hover {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}

.avm-tab.avm-tab-active {
  color: var(--interactive-accent);
  background: var(--background-secondary);
  border-color: var(--background-modifier-border);
}

/* Loading state */
.avm-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 16px;
  color: var(--text-muted);
}

/* Error state */
.avm-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-muted);
}

.avm-error button {
  padding: 8px 16px;
  border-radius: 4px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  cursor: pointer;
}

/* Import/Export status */
.avm-export-status,
.avm-import-status {
  margin-top: 12px;
  padding: 8px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Plan action bar */
.avm-plan-action-bar {
  display: flex;
  gap: 4px;
}

/* Plans table wrapper */
.avm-plans-wrapper {
  padding: 12px;
  height: 100%;
  overflow: auto;
}

.avm-plans-table {
  min-width: 600px;
}

.avm-plan-error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 12px;
}

/* Dark theme */
.theme-dark .avm-kanban-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.theme-dark .avm-project-item.avm-overdue,
.theme-dark .avm-table tr.avm-overdue-row {
  background: rgba(239, 68, 68, 0.1);
}

/* Scrollbar */
.app-version-manager ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.app-version-manager ::-webkit-scrollbar-track {
  background: transparent;
}

.app-version-manager ::-webkit-scrollbar-thumb {
  background: var(--background-modifier-border);
  border-radius: 4px;
}

.app-version-manager ::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.theme-dark .app-version-manager ::-webkit-scrollbar-thumb {
  background: var(--background-modifier-border);
}

.theme-dark .app-version-manager ::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* Gantt View (disabled — preserved for future use) */
.avm-gantt {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.avm-gantt-header {
  padding: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
}

.avm-gantt-title {
  font-size: 16px;
  font-weight: 600;
}

.avm-gantt-chart {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.avm-gantt-sidebar {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.avm-gantt-timeline-container {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.avm-gantt-timeline-header {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
}

.avm-gantt-sidebar-header {
  height: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  font-weight: 600;
  font-size: 13px;
  background: var(--background-secondary);
  position: sticky;
  top: 0;
  z-index: 10;
  box-sizing: border-box;
}

.avm-gantt-timeline {
  display: flex;
}

.avm-gantt-day-cell {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--background-modifier-border);
  font-size: 11px;
  color: var(--text-muted);
  box-sizing: border-box;
}

.avm-gantt-day-cell.avm-gantt-weekend {
  background: var(--background-modifier-hover);
}

.avm-gantt-day-cell.avm-gantt-today {
  background: rgba(99, 102, 241, 0.2);
  color: var(--interactive-accent);
  font-weight: 600;
}

.avm-gantt-date-label {
  white-space: nowrap;
}

.avm-gantt-row {
  display: flex;
  border-bottom: 1px solid var(--background-modifier-border);
  height: 40px;
  min-height: 40px;
  align-items: stretch;
}

.avm-gantt-row:hover {
  background: var(--background-modifier-hover);
}

.avm-gantt-sidebar-row {
  width: 280px;
  min-width: 280px;
  height: 40px;
  min-height: 40px;
  padding: 0 12px;
  border-right: 1px solid var(--background-modifier-border);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  background: var(--background-secondary);
  box-sizing: border-box;
}

.avm-gantt-project-name {
  font-weight: 500;
  font-size: 13px;
  white-space: normal;
  word-break: break-word;
}

.avm-gantt-project-version {
  font-size: 11px;
  color: var(--text-muted);
}

.avm-gantt-cells {
  display: flex;
  position: relative;
  overflow: hidden;
}

.avm-gantt-time-cell {
  width: 40px;
  min-width: 40px;
  height: 40px;
  border-right: 1px solid var(--background-modifier-border);
  box-sizing: border-box;
}

.avm-gantt-bar {
  position: absolute;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
  transition: opacity 0.15s;
  overflow: hidden;
}

.avm-gantt-bar:hover {
  opacity: 0.85;
}

.avm-gantt-bar-label {
  font-size: 11px;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avm-gantt-empty {
  text-align: center;
  padding: 48px;
  color: var(--text-muted);
  font-size: 14px;
}

.theme-dark .avm-gantt-day-cell.avm-gantt-today {
  background: rgba(99, 102, 241, 0.3);
}

.avm-gantt-project-bar {
  position: absolute;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: opacity 0.15s;
  overflow: visible;
}

.avm-gantt-project-bar:hover {
  opacity: 0.85;
}

.avm-gantt-marker {
  position: absolute;
  width: 12px;
  height: 12px;
  top: 50%;
  transform: translateX(-50%) translateY(-50%) rotate(45deg);
  border-radius: 2px;
  border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
`;
