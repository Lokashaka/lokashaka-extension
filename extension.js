// Lokashaka for VS Code: account, your character in a panel, and reactions to errors, runs and debugging.
// No AI and no chat here. Your code and terminal output are only checked on this computer; nothing is uploaded.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const createWatchers = require('./watchers');

const API = 'https://lokashaka.id';
const CHARACTERS = ['nina', 'wulan', 'putri', 'mika', 'sena', 'reza', 'adit']; // characters bundled with this extension
const DESKTOP_PORTS = [47400, 47401, 47402, 47403, 47404, 47405, 47406, 47407];
const OFFLINE_DAYS = 30;
const TOKEN_KEY = 'lokashaka.token';

const media = (...p) => path.join(__dirname, 'media', ...p);
const CHARS = Object.fromEntries(CHARACTERS.map((id) => [id, {
  ...JSON.parse(fs.readFileSync(media('characters', id, 'character.json'), 'utf8')),
  linesEn: JSON.parse(fs.readFileSync(media('characters', id, 'reactions_en.json'), 'utf8')),
}]));

let context;
let panel;
let output;
let status;

const cfg = () => vscode.workspace.getConfiguration('lokashaka');
const log = (message) => output?.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);

// ---------- account ----------

async function api(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || `Error ${res.status}`), { status: res.status });
  return data;
}

function ownedNow() {
  const at = context.globalState.get('ownedAt', 0);
  return Date.now() - at < OFFLINE_DAYS * 86400000 ? context.globalState.get('owned', []) : [];
}

const signedIn = () => !!context.globalState.get('email');
const ownedPackaged = () => CHARACTERS.filter((id) => ownedNow().includes(id));
let desktopChars = []; // characters running in the desktop app: [{ port, id }]
/** The chosen character when it is owned, otherwise the one on the desktop, otherwise the first owned one. */
function activeId() {
  const owned = ownedPackaged();
  const chosen = cfg().get('character');
  if (owned.includes(chosen)) return chosen;
  const running = desktopChars.find((c) => owned.includes(c.id));
  return running?.id ?? owned[0] ?? CHARACTERS[0];
}
const activeChar = () => CHARS[activeId()];
const isActive = () => signedIn() && cfg().get('showCharacter') && ownedPackaged().length > 0;

function publish() {
  panel?.sync();
  if (status) {
    status.text = '$(globe) Lokashaka';
    status.tooltip = isActive() ? `${activeChar().name} is here` : 'Open Lokashaka';
  }
}

async function clearAccount() {
  await context.secrets.delete(TOKEN_KEY);
  await context.globalState.update('email', undefined);
  await context.globalState.update('owned', []);
  await context.globalState.update('ownedAt', 0);
}

async function refreshAccount() {
  const token = await context.secrets.get(TOKEN_KEY);
  if (token) {
    try {
      const { data } = await api('/api/v1/me', { token });
      await context.globalState.update('owned', data.characters);
      await context.globalState.update('ownedAt', Date.now());
      await context.globalState.update('email', data.email);
    } catch (e) {
      log(`could not refresh account: ${e.message}`);
      if (e.status === 401) await clearAccount(); // signed out elsewhere; offline keeps the cached list
    }
  }
  publish();
}

function installId() {
  let id = context.globalState.get('installId');
  if (!id) {
    id = crypto.randomUUID();
    context.globalState.update('installId', id);
  }
  return id;
}

async function signIn() {
  const email = await vscode.window.showInputBox({ title: 'Lokashaka: Sign In', prompt: 'Email', ignoreFocusOut: true, placeHolder: 'you@example.com' });
  if (!email) return;
  const password = await vscode.window.showInputBox({ title: 'Lokashaka: Sign In', prompt: 'Password', password: true, ignoreFocusOut: true });
  if (!password) return;
  try {
    const res = await api('/api/v1/extension/login', {
      method: 'POST',
      body: { email: email.trim(), password, client: 'vscode', install_id: installId() },
    });
    await context.secrets.store(TOKEN_KEY, res.token);
    await context.globalState.update('email', res.email);
    await refreshAccount();
    vscode.window.showInformationMessage(ownedPackaged().length
      ? `Signed in as ${res.email}. ${activeChar().name} is here!`
      : `Signed in as ${res.email}. You don't own a character yet.`);
  } catch (e) {
    vscode.window.showErrorMessage(e.status ? `Lokashaka: ${e.message}` : "Lokashaka: can't reach lokashaka.id. Check your connection.");
  }
}

async function chooseCharacter() {
  const owned = ownedPackaged();
  if (!owned.length) {
    vscode.window.showInformationMessage("Lokashaka: you don't own a character yet.");
    return;
  }
  const pick = await vscode.window.showQuickPick(owned.map((id) => ({ label: CHARS[id].name, id })), { placeHolder: 'Choose your character' });
  if (pick) await cfg().update('character', pick.id, vscode.ConfigurationTarget.Global);
}

async function signOut() {
  const token = await context.secrets.get(TOKEN_KEY);
  if (token) await api('/api/v1/logout', { method: 'POST', token }).catch(() => {});
  await clearAccount();
  publish();
}

// ---------- events ----------

/** Find which characters the desktop app is running, and let the panel follow them. */
async function scanDesktop() {
  const found = [];
  if (cfg().get('desktopBridge')) {
    await Promise.all(DESKTOP_PORTS.map(async (port) => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(500) });
        const name = res.ok ? (await res.json()).name : null;
        const id = CHARACTERS.find((c) => CHARS[c].name === name);
        if (id) found.push({ port, id });
      } catch {
        // not running on this port
      }
    }));
  }
  found.sort((a, b) => a.port - b.port);
  const before = activeId();
  desktopChars = found;
  if (activeId() !== before) publish();
}

/** Every character on the desktop reacts, whichever one the panel is showing. */
async function toDesktop(event) {
  if (!cfg().get('desktopBridge')) return;
  if (!desktopChars.length) await scanDesktop();
  let lost = false;
  await Promise.all(desktopChars.map(({ port }) => fetch(`http://127.0.0.1:${port}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Lokashaka': '1' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(800),
  }).catch(() => { lost = true; })));
  if (lost) scanDesktop(); // a character was turned off
}

/** Send an event to the panel and the desktop app. Sleep is panel-only: the app detects idle time itself. */
function emit(event) {
  if (!isActive()) return;
  log(`reaction: ${JSON.stringify(event)}`);
  if (event.type !== 'sleep') toDesktop(event);
  panel?.post({ cmd: 'event', event });
}

// ---------- panel ----------

class LokashakaView {
  constructor(ctx) {
    this.ctx = ctx;
  }

  resolveWebviewView(view) {
    this.view = view;
    const root = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [root] };
    this.root = root;
    this.render();
    view.webview.onDidReceiveMessage((msg) => {
      if (msg.cmd === 'ready') this.sync();
      else if (msg.cmd === 'signin') signIn();
      else if (msg.cmd === 'store') vscode.env.openExternal(vscode.Uri.parse(`${API}/characters/${activeId()}`));
      else if (msg.cmd === 'turn-on') cfg().update('showCharacter', true, vscode.ConfigurationTarget.Global);
      else if (msg.cmd === 'activity') watchers?.activity();
    });
  }

  render() {
    this.shown = activeId();
    this.view.webview.html = this.html(this.view.webview, this.root);
  }

  sync() {
    if (this.view && this.shown !== activeId()) {
      this.render(); // the new page sends 'ready', which syncs again
      return;
    }
    this.post({
      cmd: 'state',
      active: isActive(),
      signedIn: signedIn(),
      owned: ownedPackaged().length > 0,
      language: cfg().get('language'),
    });
  }

  post(message) {
    this.view?.webview.postMessage(message);
  }

  html(webview, root) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const uri = (...f) => webview.asWebviewUri(vscode.Uri.joinPath(root, ...f));
    const id = this.shown;
    const boot = JSON.stringify({ char: CHARS[id], sheet: String(uri('characters', id, 'spritesheet.webp')) }).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri('view.css')}">
</head>
<body>
<div id="stage"><canvas id="canvas"></canvas><div id="bubble" hidden></div></div>
<div id="gate" hidden>
  <img src="${uri('characters', id, 'avatar.webp')}" alt="">
  <p id="gate-text"></p>
  <button id="gate-btn" type="button"></button>
</div>
<script nonce="${nonce}">window.LOKASHAKA = ${boot};</script>
<script nonce="${nonce}" src="${uri('view.js')}"></script>
</body>
</html>`;
  }
}

// ---------- activation ----------

let watchers;

function activate(ctx) {
  context = ctx;
  output = vscode.window.createOutputChannel('Lokashaka');
  ctx.subscriptions.push(output);
  panel = new LokashakaView(ctx);
  watchers = createWatchers(cfg, emit, log);

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('lokashaka.view', panel, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('lokashaka.show', () => vscode.commands.executeCommand('lokashaka.view.focus')),
    vscode.commands.registerCommand('lokashaka.signIn', signIn),
    vscode.commands.registerCommand('lokashaka.signOut', signOut),
    vscode.commands.registerCommand('lokashaka.chooseCharacter', chooseCharacter),
    vscode.commands.registerCommand('lokashaka.toggleCharacter', () =>
      cfg().update('showCharacter', !cfg().get('showCharacter'), vscode.ConfigurationTarget.Global)),
    vscode.commands.registerCommand('lokashaka.test', async () => {
      const pick = await vscode.window.showQuickPick([
        { label: 'Code error', event: { type: 'code-error', count: 3 } },
        { label: 'Errors fixed', event: { type: 'errors-fixed' } },
        { label: 'Run started', event: { type: 'run-start', command: 'npm run dev' } },
        { label: 'Dev server ready', event: { type: 'run-ready', command: 'npm run dev', seconds: 12 } },
        { label: 'Error in output', event: { type: 'run-output-error', command: 'npm run dev' } },
        { label: 'Run failed', event: { type: 'run-failed', command: 'npm test', code: 1 } },
        { label: 'Run succeeded', event: { type: 'run-success', command: 'npm run build', seconds: 12 } },
        { label: 'Debug started', event: { type: 'debug', active: true } },
        { label: 'Debug finished', event: { type: 'debug', active: false } },
        { label: 'Typing', event: { type: 'typing' } },
        { label: 'Sleep', event: { type: 'sleep' } },
        { label: 'Wake', event: { type: 'wake' } },
      ], { placeHolder: 'Send a test reaction' });
      if (pick) emit(pick.event);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lokashaka')) publish();
    }),
  );

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'lokashaka.show';
  status.show();
  ctx.subscriptions.push(status);

  watchers.watchDiagnostics(ctx);
  watchers.watchRuns(ctx);
  watchers.watchActivity(ctx);

  publish();
  refreshAccount();
  const timer = setInterval(refreshAccount, 6 * 3600000);
  ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
  scanDesktop();
  const desktopTimer = setInterval(scanDesktop, 5000);
  ctx.subscriptions.push({ dispose: () => clearInterval(desktopTimer) });
}

function deactivate() {}

module.exports = { activate, deactivate };
