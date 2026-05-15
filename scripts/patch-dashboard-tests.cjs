const fs = require('fs');
let content = fs.readFileSync('test/unit/run-dashboard.test.ts', 'utf8');
content = content.replace(/\r\n/g, '\n');

// Fix test 1: "Selected: team_a" → check team_a in compact header format
content = content.replace(
    'assert.ok(lines.some((line) => line.includes("Selected: team_a")));',
    '// Selected run shown as compact header "▸ team_a · completed ..."\n\tassert.ok(lines.some((line) => line.includes("team_a") && line.includes("completed")));'
);

// Fix test 2: title was simplified
content = content.replace(
    'assert.ok(lines.some((line) => line.includes("pi-crew right sidebar")));',
    'assert.ok(lines.some((line) => line.includes("pi-crew sidebar")));'
);
content = content.replace(
    'assert.ok(lines.some((line) => line.includes("anchored top-right")));',
    'assert.ok(lines.some((line) => line.includes("team_right")));'
);

fs.writeFileSync('test/unit/run-dashboard.test.ts', content);
console.log('Fixed dashboard tests');
