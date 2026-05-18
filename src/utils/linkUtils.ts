import { Notice, TFile, normalizePath, App as ObsidianApp } from 'obsidian';

export function openExternalLink(rawUrl: string): void {
  const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      new Notice('仅允许打开 http/https 链接');
      return;
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    new Notice('链接格式无效');
  }
}

export async function openProjectNote(app: ObsidianApp, memoPath: string, isAbsolutePath: boolean): Promise<void> {
  let file = app.vault.getAbstractFileByPath(memoPath);

  if (!file && isAbsolutePath) {
    const adapter = app.vault.adapter as any;
    const basePath = typeof adapter?.getBasePath === 'function' ? adapter.getBasePath() : undefined;
    if (basePath) {
      const normalizedMemoPath = normalizePath(memoPath.replace(/\\/g, '/'));
      const normalizedBase = normalizePath(basePath.replace(/\\/g, '/'));
      if (normalizedMemoPath.startsWith(normalizedBase)) {
        const relativePath = normalizedMemoPath.slice(normalizedBase.length).replace(/^\/+/, '');
        file = app.vault.getAbstractFileByPath(relativePath);
      }
    }
  }

  if (file instanceof TFile) {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
  } else {
    const encodedPath = encodeURIComponent(memoPath).replace(/%5C/g, '/');
    window.open(`file://${encodedPath}`, '_blank');
  }
}
