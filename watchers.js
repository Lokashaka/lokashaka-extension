// Detects code errors, terminal runs, debugging and activity. Everything stays on this computer.
const vscode = require('vscode');

module.exports = (cfg, emit, log) => {
  function watchDiagnostics(ctx) {
    const countErrors = () => {
      let n = 0;
      for (const [, diags] of vscode.languages.getDiagnostics()) {
        for (const d of diags) if (d.severity === vscode.DiagnosticSeverity.Error) n++;
      }
      return n;
    };
    let last = countErrors();
    let lastPing = 0;
    let settle;
    // tunggu sampai diagnostik tenang supaya tidak panik di tengah ngetik
    const check = () => {
      const n = countErrors();
      if (cfg().get('reactToDiagnostics')) {
        if (n > last && Date.now() - lastPing > 20000) {
          emit({ type: 'code-error', count: n });
          lastPing = Date.now();
        } else if (n === 0 && last > 0) {
          emit({ type: 'errors-fixed' });
        }
      }
      last = n;
    };
    ctx.subscriptions.push(vscode.languages.onDidChangeDiagnostics(() => {
      clearTimeout(settle);
      settle = setTimeout(check, 2500);
    }));
  }

  // perintah yang layak dipantau (bukan cd/ls/git status)
  const RUN_COMMAND = /^(&\s*)?"?([^\s"]*[\\/])?(npm|pnpm|yarn|bun|bunx|npx|node|nodemon|tsx|ts-node|deno|uvicorn|flask|python3?|py|pip|uv|poetry|pytest|go|cargo|dotnet|java|javac|mvn|gradle|gradlew|php|composer|flutter|dart|make|cmake|ruby|rails|docker|tsc|vite|next|jest|vitest)(\.exe|\.cmd)?"?(\s|$)/i;
  // tanda dev server / build siap
  const READY = /(ready in|compiled successfully|compiled client and server|local:\s+https?:\/\/|listening on|server (is )?running|started server on|running on https?:\/\/|build succeeded|webpack compiled successfully)/i;
  // tanda error di output perintah yang masih jalan
  const OUTPUT_ERROR = /(failed to compile|compiled with errors?|module not found|cannot find module|traceback \(most recent call last\)|unhandled (promise )?rejection|uncaught \w*error|\b(syntax|type|reference)error\b|npm err!|error ts\d+|⨯ )/i;
  const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g;
  // Ctrl+C: 130 di bash, STATUS_CONTROL_C_EXIT di Windows
  const CANCEL_CODES = new Set([130, -1073741510, 3221225786]);

  const seconds = (run) => Math.round((Date.now() - run.start) / 1000);

  async function watchOutput(execution, run) {
    let tail = '';
    try {
      for await (const chunk of execution.read()) {
        tail = (tail + chunk.replace(ANSI, '')).slice(-4000);
        if (OUTPUT_ERROR.test(tail)) {
          if (Date.now() - run.lastError > 15000) {
            run.lastError = Date.now();
            log(`error in output: ${run.command}`);
            emit({ type: 'run-output-error', command: run.command });
          }
          run.broken = true;
          tail = '';
        } else if (READY.test(tail)) {
          // siap pertama kali, atau pulih lagi setelah error
          if (!run.ready || run.broken) {
            log(`ready: ${run.command} (${seconds(run)} s)`);
            emit({ type: 'run-ready', command: run.command, seconds: seconds(run) });
          }
          run.ready = true;
          run.broken = false;
          tail = '';
        }
      }
    } catch (e) {
      log(`could not read output of ${run.command}: ${e}`);
    }
  }

  function finishRun(run, code) {
    log(`finished: ${run.command} (exit ${code}, ${seconds(run)} s)`);
    if (!cfg().get('reactToTerminal') || code === undefined || CANCEL_CODES.has(code)) return;
    if (code !== 0) {
      if (Date.now() - run.lastError > 5000) emit({ type: 'run-failed', command: run.command, code });
    } else if (!run.ready && seconds(run) >= cfg().get('minRunSeconds')) {
      emit({ type: 'run-success', command: run.command, seconds: seconds(run) });
    }
  }

  function watchRuns(ctx) {
    const runs = new WeakMap();
    const newRun = (command) => ({ command, start: Date.now(), ready: false, broken: false, lastError: 0 });
    ctx.subscriptions.push(
      vscode.window.onDidChangeTerminalShellIntegration((e) => log(`shell integration active in terminal "${e.terminal.name}"`)),
      vscode.window.onDidStartTerminalShellExecution((e) => {
        activity();
        const run = newRun(e.execution.commandLine?.value?.trim() || 'The command');
        runs.set(e.execution, run);
        log(`started: ${run.command}`);
        if (!cfg().get('reactToTerminal') || !RUN_COMMAND.test(run.command)) return;
        emit({ type: 'run-start', command: run.command });
        watchOutput(e.execution, run);
      }),
      vscode.window.onDidEndTerminalShellExecution((e) => {
        activity();
        const run = runs.get(e.execution);
        if (run) finishRun(run, e.exitCode);
      }),
      vscode.tasks.onDidStartTaskProcess((e) => runs.set(e.execution, newRun(`Task ${e.execution.task.name}`))),
      vscode.tasks.onDidEndTaskProcess((e) => {
        activity();
        const run = runs.get(e.execution);
        if (run) finishRun(run, e.exitCode);
      }),
      vscode.debug.onDidStartDebugSession(() => emit({ type: 'debug', active: true })),
      vscode.debug.onDidTerminateDebugSession(() => {
        if (!vscode.debug.activeDebugSession) emit({ type: 'debug', active: false });
      }),
    );
  }

  let lastActivity = Date.now();
  let sleeping = false;

  function activity() {
    lastActivity = Date.now();
    if (sleeping) {
      sleeping = false;
      emit({ type: 'wake' });
    }
  }

  function watchActivity(ctx) {
    let lastTyping = 0;
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== 'file' || !e.contentChanges.length) return;
        activity();
        if (Date.now() - lastTyping > 2000) {
          lastTyping = Date.now();
          emit({ type: 'typing' });
        }
      }),
      vscode.window.onDidChangeTextEditorSelection(() => activity()),
      vscode.window.onDidChangeActiveTextEditor(() => activity()),
      vscode.window.onDidChangeWindowState((s) => s.focused && activity()),
    );
    const timer = setInterval(() => {
      if (!sleeping && Date.now() - lastActivity > cfg().get('sleepAfterMinutes') * 60000) {
        sleeping = true;
        emit({ type: 'sleep' });
      }
    }, 30000);
    ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
  }

  return { watchDiagnostics, watchRuns, watchActivity, activity };
};
