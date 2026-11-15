# Lokashaka for VS Code

Your Lokashaka character keeps you company while you code. She panics when errors appear, cheers when a run succeeds, sits on a tiny terminal, falls asleep when you step away, and loves headpats.

Lokashaka is for people aged 18 or older.

## Getting started

1. Open the Command Palette (`Ctrl+Shift+P`, or `Cmd+Shift+P` on Mac) and run **Lokashaka: Sign In**.
2. Enter the email and password of your [lokashaka.id](https://lokashaka.id) account.
3. Run **Lokashaka: Show Panel**, or click **Lokashaka** in the status bar at the bottom right. Your character appears in the bottom panel, next to the Terminal tab.

You need to own a character to see it here. Every character has a free trial in the [desktop app](https://lokashaka.id/download).

## What she does

| When this happens | She reacts |
| --- | --- |
| The number of errors in your code goes up | Panics |
| All errors are fixed | Celebrates |
| A terminal command or task starts | Watches it run |
| A dev server is ready, or a run succeeds | Cheers |
| A run fails, or errors appear in its output | Gets worried |
| You start or finish debugging | Reacts to the session |
| You are typing | Keeps you company |
| The editor is unused for a while | Falls asleep, and wakes when you return |

Click the top of her head for a headpat, or click her body to poke her. When nothing is happening, she walks around the panel and sits on her mini terminal.

Terminal reactions need shell integration, which most VS Code terminals turn on by themselves. To check every reaction without running anything, use **Lokashaka: Test a Reaction**.

## Commands

| Command | What it does |
| --- | --- |
| Lokashaka: Show Panel | Opens the panel |
| Lokashaka: Sign In | Signs in to your account |
| Lokashaka: Sign Out | Signs out on this editor |
| Lokashaka: Turn Character On or Off | Shows or hides your character |
| Lokashaka: Choose Character | Picks which of your characters to show |
| Lokashaka: Test a Reaction | Sends a test reaction |

## Settings

Open Settings (`Ctrl+,`) and search for **Lokashaka**.

| Setting | Default | What it does |
| --- | --- | --- |
| `lokashaka.character` | Empty | Which of your characters to show; empty follows the character running in the desktop app |
| `lokashaka.showCharacter` | On | Shows your character in the panel |
| `lokashaka.language` | `en` | Language she speaks: `en` or `id` |
| `lokashaka.desktopBridge` | On | Follows the character running in the desktop app and sends it your reactions |
| `lokashaka.reactToDiagnostics` | On | Reacts when errors go up or reach zero |
| `lokashaka.reactToTerminal` | On | Reacts to terminal commands and tasks |
| `lokashaka.minRunSeconds` | 2 | Successful commands faster than this are not celebrated |
| `lokashaka.sleepAfterMinutes` | 5 | Minutes of no use before she falls asleep in the panel |

## Using it with the desktop app

The two work together but do different things:

- This extension shows your character in the panel. It has no AI and no chat.
- The [desktop app](https://lokashaka.id/download) shows your character on your desktop, and is where you chat with her.

While the desktop app is running, the panel shows the same character, and it reacts to your code on your desktop as well. Turn on a different character in the app and the panel switches within a few seconds, unless you picked one with **Lokashaka: Choose Character**. To have her sit on your editor window, turn on **Sit on code editor windows** under Settings in the desktop app.

## Other code editors

Editors that use Open VSX, such as VSCodium and many VS Code forks, can install Lokashaka from [Open VSX](https://open-vsx.org/extension/lokashaka/lokashaka). You can also download the `.vsix` file from [lokashaka.id/download](https://lokashaka.id/download), then choose **Install from VSIX** in the Extensions view.

## Troubleshooting

- **The panel asks me to sign in or to get a character.** Sign in with the account that owns the character. After buying, run **Lokashaka: Sign Out**, then sign in again to refresh your list.
- **I can't find the panel.** Run **Lokashaka: Show Panel**. If the bottom panel is hidden, this opens it.
- **She doesn't react to terminal commands.** Check that `lokashaka.reactToTerminal` is on and that your terminal has shell integration. Very fast successful commands are not celebrated.
- **Nothing happens on my desktop character.** Make sure the desktop app is running with that character turned on, and that `lokashaka.desktopBridge` is on.
- **I need to see what happened.** Open the **Output** panel and choose **Lokashaka** for a log of reactions.

## Privacy

This extension has no AI and no chat. It checks error counts and terminal results only on your computer and uploads nothing. Sign-in uses your email and password once; your password is never stored, and the session token is kept in VS Code's secret storage. See the [Privacy Policy](https://lokashaka.id/privacy).

Lokashaka characters are AI companions, not people. [Terms of Service](https://lokashaka.id/terms).
