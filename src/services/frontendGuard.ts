import fs from 'node:fs';

export const APPROVED_FRONTEND_MARKER = '<meta name="otzaria-frontend" content="v2" />';

export function hasApprovedFrontend(indexPath: string): boolean {
  if (!fs.existsSync(indexPath)) return false;
  return fs.readFileSync(indexPath, 'utf8').includes(APPROVED_FRONTEND_MARKER);
}
