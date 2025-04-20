import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile } from 'obsidian';
import { normalizePath } from 'obsidian';
import { around } from 'monkey-around';
import { filesRecursePassCb, isFileName, isRelativePath, myRealpath } from './util';

interface RelRootPluginSettings {
  pathMapList: string
}

// Do not map anything by default
const DEFAULT_SETTINGS: RelRootPluginSettings = {
  pathMapList: '',
}


class FileToPathMap {
  fileToPath: Map<string, string>

  constructor() {
    this.fileToPath = new Map<string, string>();
  }
  public get(fileName: string): string | null {
    const p = this.fileToPath.get(fileName);
    if (p === undefined)
      return null;
    return p;
  }
  public set(fileName: string, filePath: string) {
    this.fileToPath.set(fileName, filePath);
  }
  public del(fileName: string) {
    this.fileToPath.delete(fileName);
  }
}

//TODO: update fileNamesMap on files create & modify
class PathMap {
  dirToBasedir: Map<string, string> // map of basedir, resource dir entries
  fileNamesMap: Map<string, FileToPathMap>
  plugin: Plugin;

  public static parseFromStr(str: string, plugin: Plugin) : PathMap | null {
    const arr: string[] = str.split("\n");
    if (arr.length < 1)
      return null;
    let out = new Map<string, string>();

    arr.forEach((ln: string) => {
      out.set(ln, ln);
    })
    return new PathMap(out, plugin);
  }

  constructor(map: Map<string, string> | null, plugin: Plugin) {
    this.plugin = plugin;
    if (map) {
      this.dirToBasedir = map;
      this.fileNamesMap = new Map();
    } else {
      this.dirToBasedir = new Map();
      this.fileNamesMap = new Map();
    }
    this.mkFileLinksCache();
  }

  getPathFromLinkFileName(basePath: string, fileName: string): string | null {
    const ftp = this.fileNamesMap.get(basePath);
    const tmp = ftp!.get(fileName);
    if (tmp !== null)
      return tmp;
    return ftp!.get(fileName + ".md");
  }

  mkFileLinksCache() {
    for (const p of this.dirToBasedir.keys()) {
      const ftp = new FileToPathMap();
      this.fileNamesMap.set(p, ftp);
      const folder = this.plugin.app.vault.getFolderByPath(p);
      if (folder === null) {
        new Notice(`multiroot plugin. can't find  directory ${p}`);
        continue;
      }
      filesRecursePassCb(folder, (e: TAbstractFile) => {
        if (e instanceof TFile) {
          ftp.set(e.name, e.path);
        }
      });
    }
  }

  resolve(metadataCacheThis: any, args:any, origFunction: any) {
    let argTgtFile: string = args[0];
    let srcFile: string = args[1];
        if (srcFile == "") {
          const activeFile = this.plugin.app.workspace.getActiveFile();
          if (!(activeFile instanceof TFile)) {
            return origFunction();
          }
          srcFile = activeFile.path;
        }

        let basePath = this.getBasePath(srcFile)
        if (basePath === null)
          return origFunction();

        if (isRelativePath(argTgtFile)) {
          const tmp = metadataCacheThis.getFileLinksCache(basePath, argTgtFile);
          if (tmp !== null)
            return this.plugin.app.vault.getFileByPath(tmp);
        } else if (isFileName(argTgtFile)) {
          const tmp = this.getPathFromLinkFileName(basePath, argTgtFile);
          if (tmp !== null) {
            const filePath = this.plugin.app.vault.getFileByPath(tmp);
            if (filePath !== null)
              return filePath;
            return origFunction();
          }
        }

        let tmp = this.plugin.app.vault.getFileByPath(myRealpath(`${basePath}/${argTgtFile}`));
        if (tmp !== null)
          return tmp;
        tmp = this.plugin.app.vault.getFileByPath(myRealpath(`${basePath}/${argTgtFile}.md`));
        if (tmp !== null)
          return tmp;
        return origFunction();
  }

  // Tries to find base path for provided path. Returns null if input path is not part of any registered pathmap
  getBasePath(fpath: string) : string | null {
    let tmp = myRealpath(normalizePath(fpath));

    //TODO: multinesting?
    for (const [key, value] of this.dirToBasedir) {
      if (fpath.startsWith(key)) {
        return value;
      }
    }
    return null;
  }
}

export default class RelRootPlugin extends Plugin {
  settings: RelRootPluginSettings;
  pathMap: PathMap | null;
  hooksUnregLst: any[];

  async onload() {
    this.hooksUnregLst = []
    await this.loadSettings();

    this.pathMap = PathMap.parseFromStr(this.settings.pathMapList, this);
    /*
    this.pathMap = new PathMap(new Map([
      ["test", "test"]
    ]));
    */

    /*
    this.registerEvent(this.app.workspace.on('file-open', (file: TFile | null) => {
      console.log('file-open');
      console.log(file.path);
    }));
    */
    //this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
    //this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    // const activeFile = this.app.workspace.getActiveFile();

    let plugin = this;
    let uninstaller = around(this.app.metadataCache, {
      getFirstLinkpathDest(oldMethod) {
        return function (...args) {
          //console.log("wrapper 1 before someMethod", args);
          const orig = () => {
            return oldMethod && oldMethod.apply(this, args);
          }
          if (!plugin.pathMap) {
            return orig();
          }
          return plugin.pathMap.resolve(this, args, orig);

        }
      }
    });
    this.hooksUnregLst.push(uninstaller);

    /*
    around(this.app.workspace, {
      openLinkText(oldMethod) {
        return function (...args) {
          console.log("wrapper 2 before someMethod", args);
          const result = oldMethod && oldMethod.apply(this, args);
          //console.log("wrapper 2 after someMethod", result);
          return result;
        }
      }
    });
    */

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new RelRootSettingsTab(this.app, this));
  }

  onunload() {
    this.hooksUnregLst.forEach((v) => {
      v();

    });
    this.hooksUnregLst = [];
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    this.pathMap = PathMap.parseFromStr(this.settings.pathMapList, this);
    await this.saveData(this.settings);
  }
}

class RelRootSettingsTab extends PluginSettingTab {
  plugin: RelRootPlugin;

  constructor(app: App, plugin: RelRootPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Directory maps')
      .setDesc('Enum subvault paths, one per line. Files inside this directories try to resolve links with respect to their base directories')
      .addTextArea(text => text
        .setPlaceholder('write path maps')
        .setValue(this.plugin.settings.pathMapList)
        .onChange(async (value) => {
          this.plugin.settings.pathMapList = value;
          await this.plugin.saveSettings();
        }));
  }
}
