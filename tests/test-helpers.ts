// Module loader test helpers
export class TestModuleLoader {
  private static moduleCache = new Map();
  private static discoveredFolders: string[] | null = null;

  static clearCache(): void {
    this.moduleCache.clear();
    this.discoveredFolders = null;
  }
}