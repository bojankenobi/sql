/**
 * SQL Master Terminal v13.0 (Snippet Support)
 * Features: 
 * - Snippet Toolbar for Mobile
 * - Auto Plac Project
 * - Persistence & Bug Fixes
 */

// --- GLOBAL STATE ---
let db = null;
let SQLEngine = null; // Globalna referenca na engine
let currentLevel = 0;
let commandHistory = [];
let historyIndex = -1;
let currentInput = ""; 
let lastQueryResult = null;

// --- MISIJE ---
const MISSIONS = [
    {
        id: 0,
        title: "Kreiranje Tabele (DDL)",
        desc: "Baza je trenutno prazna. Tvoj prvi zadatak je da kreiraš tabelu 'korisnici' koja ima kolone: id (INTEGER) i ime (TEXT).",
        hint: "CREATE TABLE korisnici (id INTEGER, ime TEXT);",
        validate: (res) => {
            try {
                const check = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='korisnici'");
                return check.length > 0;
            } catch(e) { return false; }
        }
    },
    {
        id: 1,
        title: "Unos Podataka (INSERT)",
        desc: "Odlično! Sada ubaci jednog korisnika u tabelu 'korisnici'. (Bilo koji ID i ime).",
        hint: "INSERT INTO korisnici VALUES (1, 'Petar');",
        validate: (res) => {
            try {
                const check = db.exec("SELECT count(*) FROM korisnici");
                return check[0].values[0][0] > 0;
            } catch(e) { return false; }
        }
    },
    {
        id: 2,
        title: "Selektovanje (SELECT)",
        desc: "Sada kada imamo podatke, selektuj sve kolone iz tabele 'korisnici'.",
        hint: "SELECT * FROM korisnici;",
        validate: (res) => res && res.length > 0 && res[0].columns.includes("ime")
    },
    {
        id: 3,
        title: "Napredno: Auto Plac",
        desc: "Vreme je za pravi posao. Idi na tab 'Vežbe' i kreiraj tabelu 'automobili' kako je tamo opisano.",
        hint: "Prati uputstva u tabu Vežbe za kreiranje tabele automobili.",
        validate: (res) => {
            try {
                const check = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='automobili'");
                return check.length > 0;
            } catch(e) { return false; }
        }
    }
];

// --- XTERM SETUP ---
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
    theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#334155'
    },
    convertEol: true
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal-container'));
fitAddon.fit();

window.addEventListener('resize', () => fitAddon.fit());

// Dodatna siguracija za mobilne uredjaje
setInterval(() => {
    if(term && fitAddon) fitAddon.fit();
}, 2000);

// --- INPUT HANDLING ---
term.onData(data => {
    if (data.length > 1) { handlePaste(data); return; }
    if (data.charCodeAt(0) === 13) { handleCommand(currentInput); return; }
    if (data.charCodeAt(0) === 127) { 
        if (currentInput.length > 0) { currentInput = currentInput.slice(0, -1); term.write('\b \b'); } 
        return; 
    }
    if (data === '\x1b[A' || data === '\x1b[B') { handleHistory(data); return; }
    if (data.charCodeAt(0) >= 32) { currentInput += data; term.write(data); }
});

function handlePaste(text) {
    const cleanText = text.replace(/[\r\n]+/g, ' ').trim();
    currentInput += cleanText;
    term.write(cleanText);
}

function handleHistory(direction) {
    if (direction === '\x1b[A') { 
        if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) historyIndex++; else return;
    } else { 
        if (historyIndex > -1) historyIndex--; else return;
    }
    term.write('\x1b[2K\r\x1b[1;36msql>\x1b[0m ');
    currentInput = (historyIndex > -1) ? commandHistory[commandHistory.length - 1 - historyIndex] : "";
    term.write(currentInput);
}

// --- CORE SYSTEM LOGIC ---

async function initSql() {
    try {
        SQLEngine = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        
        db = new SQLEngine.Database();
        
        welcomeMessage();
        renderMissionUI();
        initSnippets(); // <--- NOVO: Pokrećemo snippet bar
        prompt();
        updateStatus("Sistem spreman (Prazna baza)", false);
    } catch (err) {
        term.writeln(`\r\n\x1b[31mCRITICAL ERROR: ${err.message}\x1b[0m`);
        updateStatus("Greška u učitavanju", true);
    }
}

function prompt(newLine = true) {
    if (newLine) term.write('\r\n');
    term.write('\x1b[1;36msql>\x1b[0m ');
}

function handleCommand(cmd) {
    term.write('\r\n');
    const trimmed = cmd.trim();

    if (!trimmed) { currentInput = ""; prompt(false); return; }

    if (commandHistory.length === 0 || trimmed !== commandHistory[commandHistory.length - 1]) {
        commandHistory.push(trimmed);
    }
    historyIndex = -1;
    currentInput = "";

    if (trimmed.toLowerCase() === 'clear') { term.clear(); prompt(false); return; }

    executeSQL(trimmed);
    prompt(false);
}

function executeSQL(sql) {
    const start = performance.now();
    lastQueryResult = null;
    try {
        const res = db.exec(sql);
        const end = performance.now();
        
        if (res.length > 0) {
            renderTable(res[0]);
            lastQueryResult = res;
        } else {
            term.writeln('\x1b[32m✔ Komanda uspešno izvršena.\x1b[0m');
        }
        if (sql.match(/(CREATE|DROP|ALTER)/i)) refreshSidebar();
        updateStatus(`Izvršeno za: ${(end - start).toFixed(2)}ms`, false);
    } catch (err) {
        term.writeln(`\x1b[31m✖ Greška: ${err.message}\x1b[0m`);
        updateStatus("SQL Greška", true);
    }
}

// --- SNIPPETS SYSTEM (NOVO) ---
function initSnippets() {
    // Lista najčešćih komandi i simbola
    const snippets = [
        "SELECT", "*", "FROM", "WHERE", ";", 
        "INSERT INTO", "VALUES", "UPDATE", "SET", 
        "DELETE", "CREATE TABLE", "DROP TABLE",
        "INTEGER", "TEXT", "PRIMARY KEY",
        "ORDER BY", "GROUP BY", "JOIN", "ON",
        "=", "(", ")", "'", "," 
    ];
    
    const container = document.getElementById('snippet-container');
    if (!container) return; // Za svaki slučaj ako nije u HTML-u
    
    container.innerHTML = ''; // Brišemo staro
    
    snippets.forEach(snip => {
        const btn = document.createElement('button');
        btn.innerText = snip;
        btn.className = 'snippet-btn';
        
        // Ako je simbol, dodaj klasu za drugu boju (definisano u CSS-u)
        if (["*", ";", "=", "(", ")", "'", ","].includes(snip)) {
            btn.classList.add('symbol');
        }
        
        // Na klik ubacujemo tekst
        btn.onclick = () => insertSnippet(snip);
        container.appendChild(btn);
    });
}

function insertSnippet(text) {
    // Dodajemo razmak automatski ako ga nema, osim za interpunkciju
    const needsSpace = currentInput.length > 0 && !["*", ";", ",", ")"].includes(text) && currentInput.slice(-1) !== " ";
    const finalText = (needsSpace ? " " : "") + text;
    
    currentInput += finalText;
    term.write(finalText);
    term.focus(); // Vraćamo fokus na terminal da tastatura ostane aktivna
}

// --- PERSISTENCE SYSTEM (SAVE/LOAD) ---

function prepareStateForSave() {
    try {
        db.run("CREATE TABLE IF NOT EXISTS __app_state__ (key TEXT PRIMARY KEY, value TEXT)");
        db.run("INSERT OR REPLACE INTO __app_state__ (key, value) VALUES ('level', ?)", [currentLevel.toString()]);
        const historyJSON = JSON.stringify(commandHistory.slice(-50));
        db.run("INSERT OR REPLACE INTO __app_state__ (key, value) VALUES ('history', ?)", [historyJSON]);
    } catch(e) { console.error("Greška pri čuvanju stanja:", e); }
}

function restoreStateFromDb() {
    try {
        const levelRes = db.exec("SELECT value FROM __app_state__ WHERE key='level'");
        if (levelRes.length > 0 && levelRes[0].values.length > 0) {
            currentLevel = parseInt(levelRes[0].values[0][0]);
            renderMissionUI();
        }
        const histRes = db.exec("SELECT value FROM __app_state__ WHERE key='history'");
        if (histRes.length > 0 && histRes[0].values.length > 0) {
            commandHistory = JSON.parse(histRes[0].values[0][0]);
            term.writeln("\r\n\x1b[90m--- Restaurirana Istorija ---\x1b[0m");
            commandHistory.slice(-3).forEach(cmd => term.writeln(`> ${cmd}`));
            term.writeln("\x1b[90m-----------------------------\x1b[0m");
        }
    } catch(e) { console.log("Nema sačuvanog stanja."); }
}

window.saveDatabase = function() {
    prepareStateForSave();
    const data = db.export();
    const blob = new Blob([data]);
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `sql_vezba_level${currentLevel}_${new Date().getTime()}.sqlite`;
    a.click();
    term.writeln('\r\n\x1b[32m✔ Baza i napredak su uspešno sačuvani.\x1b[0m');
    prompt(false);
};

window.loadDatabase = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    term.writeln(`\r\n\x1b[33m>>> Učitavanje fajla: ${file.name}...\x1b[0m`);

    const reader = new FileReader();
    reader.onload = function() {
        try {
            const uInt8Array = new Uint8Array(this.result);
            if (!SQLEngine) throw new Error("SQL Engine nije inicijalizovan!");
            
            db = new SQLEngine.Database(uInt8Array);
            restoreStateFromDb();
            refreshSidebar();
            
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__app_%'");
            const tableNames = tables.length > 0 ? tables[0].values.flat().join(", ") : "Nema tabela";
            
            term.writeln(`\x1b[32m✔ Uspešno učitano!\x1b[0m`);
            term.writeln(`\x1b[36mPronađene tabele: ${tableNames}\x1b[0m`);
            prompt(false);
        } catch(e) {
            term.writeln(`\x1b[31mGreška pri otvaranju fajla: ${e.message}\x1b[0m`);
            prompt(false);
        }
    }
    reader.readAsArrayBuffer(file);
    input.value = '';
};

// --- UI HELPER FUNCTIONS ---
function renderTable(data) {
    const columns = data.columns;
    const values = data.values;
    const colWidths = columns.map((col, i) => {
        let max = col.toString().length;
        values.forEach(row => { const val = row[i] ? row[i].toString() : "NULL"; if (val.length > max) max = val.length; });
        return max + 2;
    });
    const formatRow = (row) => row.map((val, i) => (val === null ? "NULL" : val.toString()).padEnd(colWidths[i])).join(" | ");
    const separator = colWidths.map(w => "-".repeat(w)).join("-+-");
    term.writeln(""); term.writeln(`\x1b[1;34m ${formatRow(columns)} \x1b[0m`); term.writeln(`\x1b[90m-${separator}-\x1b[0m`);
    values.forEach(row => term.writeln(` ${formatRow(row)} `));
    term.writeln(`\r\n\x1b[90m(${values.length} redova)\x1b[0m`);
}

function refreshSidebar() {
    try {
        const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__app_%'");
        const list = document.getElementById('table-list');
        list.innerHTML = '';
        if (res.length > 0 && res[0].values.length > 0) {
            res[0].values.forEach(row => {
                const tableName = row[0];
                const li = document.createElement('li');
                li.innerHTML = `<i class="fas fa-table"></i> ${tableName}`;
                li.onclick = () => {
                    const sql = `SELECT * FROM ${tableName} LIMIT 10;`;
                    currentInput = sql;
                    term.write('\x1b[2K\r\x1b[1;36msql>\x1b[0m ' + sql);
                };
                list.appendChild(li);
            });
        } else { list.innerHTML = '<li style="color: #64748b;"><i>Prazna baza</i></li>'; }
    } catch (e) { console.error(e); }
}

function updateStatus(msg, isError) {
    document.getElementById('exec-timer').innerText = msg;
    document.getElementById('status-text').innerHTML = isError ? 
        `<i class="fas fa-exclamation-triangle" style="color:var(--error)"></i> Greška` : 
        `<i class="fas fa-check-circle" style="color:var(--success)"></i> Spreman`;
}

// Demo data - opcionalno
window.loadDemoData = function() { loadDemoDataInternal(); }
function loadDemoDataInternal() {
    const sql = `
        DROP TABLE IF EXISTS studenti; CREATE TABLE studenti (id INTEGER PRIMARY KEY, ime TEXT, prezime TEXT, grad TEXT);
        INSERT INTO studenti VALUES (1, 'Marko', 'Marković', 'Beograd'), (2, 'Jelena', 'Jovanović', 'Novi Sad'), (3, 'Petar', 'Petrović', 'Niš'), (4, 'Ana', 'Nikolić', 'Beograd');
        DROP TABLE IF EXISTS predmeti; CREATE TABLE predmeti (id INTEGER, naziv TEXT);
        INSERT INTO predmeti VALUES (101, 'Baze Podataka'), (102, 'Programiranje');
        DROP TABLE IF EXISTS ocene; CREATE TABLE ocene (ucenik_id INTEGER, predmet_id INTEGER, ocena INTEGER);
        INSERT INTO ocene VALUES (1, 101, 9), (1, 102, 10), (2, 101, 8), (4, 102, 9);
    `;
    try { db.exec(sql); refreshSidebar(); term.writeln("\r\n\x1b[35m>>> Demo podaci učitani.\x1b[0m"); prompt(false); } 
    catch(e) { term.writeln(`Greška: ${e.message}`); }
}

// --- MISSION UI ---
function renderMissionUI() {
    if (currentLevel >= MISSIONS.length) {
        document.getElementById('level-badge').innerText = "MASTER";
        document.getElementById('mission-desc').innerText = "Čestitamo! Prešli ste sve misije.";
        document.getElementById('mission-status-text').innerHTML = "";
        document.getElementById('level-list').innerHTML = "";
        return;
    }
    const m = MISSIONS[currentLevel];
    document.getElementById('level-badge').innerText = `Level ${m.id + 1}`;
    document.getElementById('mission-desc').innerText = m.desc;
    document.getElementById('mission-status-text').innerHTML = '<span style="color:#fbbf24">Čekam rešenje...</span>';
    
    const list = document.getElementById('level-list');
    list.innerHTML = '';
    MISSIONS.forEach((miss, idx) => {
        const div = document.createElement('div');
        div.className = `level-item ${idx === currentLevel ? 'active' : ''}`;
        if (idx < currentLevel) div.classList.add('completed');
        div.innerHTML = `<i class="fas ${idx < currentLevel ? 'fa-check-circle' : 'fa-circle'}"></i> Misija ${idx + 1}`;
        if (idx <= currentLevel) { div.onclick = () => { currentLevel = idx; renderMissionUI(); }; }
        list.appendChild(div);
    });
}

window.checkSolution = function() {
    const mission = MISSIONS[currentLevel];
    const statusEl = document.getElementById('mission-status-text');
    if (mission.validate(lastQueryResult)) {
        statusEl.innerHTML = '<span style="color:#22c55e; font-weight:bold">✔ BRAVO!</span>';
        term.writeln(`\r\n\x1b[1;32m★ MISIJA ${mission.id + 1} POLOŽENA! ★\x1b[0m`);
        setTimeout(() => { currentLevel++; renderMissionUI(); term.writeln(`\x1b[33m>>> Učitana sledeća misija...\x1b[0m`); prompt(false); }, 1200);
    } else {
        statusEl.innerHTML = '<span style="color:#ef4444">Netačno.</span>';
        term.writeln(`\r\n\x1b[31mHINT: ${mission.hint}\x1b[0m`); prompt(false);
    }
};

function welcomeMessage() {
    term.writeln('\x1b[1;32mSQL MASTER LEO v2.0\x1b[0m'); // Larry Ellison Oracle Omaž
    term.writeln('\x1b[90mPowered by SQL.js & Xterm.js\x1b[0m');
    term.writeln('\r\nKoristite dugmiće iznad za brzi unos komandi.');
    term.writeln('Pratite "Vežbe" za Auto Plac projekat.');
}

// Start
initSql();