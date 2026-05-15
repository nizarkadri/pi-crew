const fs = require('fs');
let content = fs.readFileSync('src/ui/crew-widget.ts', 'utf8');

// Add cached runs field
content = content.replace(
    'private cachedTheme: CrewTheme;\n\tprivate readonly unsubscribeTheme: () => void;\n\tprivate readonly unsubscribeEventBus: () => void;',
    'private cachedTheme: CrewTheme;\n\tprivate readonly unsubscribeTheme: () => void;\n\tprivate readonly unsubscribeEventBus: () => void;\n\t/** Cached runs — refreshed only on event invalidation, NOT on every render frame. */\n\tprivate cachedRuns: WidgetRun[] | null = null;'
);

// Update invalidate() to also clear cached runs
content = content.replace(
    '\tinvalidate(): void {\n\t\tthis.cacheSignature = "";\n\t\tthis.cachedBaseLines = [];\n\t\tthis.cachedLines = [];\n\t}',
    '\tinvalidate(): void {\n\t\tthis.cacheSignature = "";\n\t\tthis.cachedBaseLines = [];\n\t\tthis.cachedLines = [];\n\t\tthis.cachedRuns = null;\n\t}'
);

// Replace render() to use cached runs
content = content.replace(
    '\trender(width: number): string[] {\n\t\tconst runs = activeWidgetRuns(this.model.cwd, this.model.manifestCache, this.model.snapshotCache, this.model.preloadManifests);',
    '\trender(width: number): string[] {\n\t\t// Only refresh runs from disk when invalidated by events, not on every render frame.\n\t\tif (!this.cachedRuns) {\n\t\t\tthis.cachedRuns = activeWidgetRuns(this.model.cwd, this.model.manifestCache, this.model.snapshotCache, this.model.preloadManifests);\n\t\t}\n\t\tconst runs = this.cachedRuns;'
);

fs.writeFileSync('src/ui/crew-widget.ts', content);
console.log('Fixed widget render caching');
