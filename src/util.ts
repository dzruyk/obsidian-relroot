import { TFolder, TAbstractFile } from 'obsidian';

export function myRealpath(path: string): string {
  path = path.trim();
  const segments = path.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    } else if (segment === '..') {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      stack.push(segment);
    }
  }
  const canonicalPath = stack.join('/');
  return canonicalPath;
}

export function isRelativePath(path: string): boolean {
  if (path.startsWith("./") || path.startsWith("../"))
    return true;
  return false;
}

export function isFileName(path: string): boolean {
  return path.indexOf('/') == -1;
}

export type ChildPassFunction = (e?: TAbstractFile) => void;

export function filesRecursePassCb (e: TAbstractFile, t: ChildPassFunction) {
  let n: TAbstractFile[] = [];
  for (n = [e]; n.length > 0; ) {
    var i = n.pop();
    if (i && (t(i),
        i instanceof TFolder)) {
      const tmp = i as TFolder;
      let r: TAbstractFile[] = tmp.children;
      n = n.concat(r)
    }
  }
}

