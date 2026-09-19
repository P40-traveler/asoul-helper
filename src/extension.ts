import * as vscode from "vscode";
import { BreakReminder } from "./breakReminder";
import { MEMBER_FILE_NAME, MemberStore } from "./members";
import { Monitor } from "./monitor";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("A-SOUL B站提醒");
  const members = new MemberStore(context);
  await members.ensureExists();

  const monitor = new Monitor(context, members, output);
  const breakReminder = new BreakReminder(output);
  context.subscriptions.push(
    output,
    monitor,
    breakReminder,
    vscode.commands.registerCommand("asoulNotifier.openMemberFile", () => members.open()),
    vscode.commands.registerCommand("asoulNotifier.checkNow", () => monitor.check(true)),
    vscode.commands.registerCommand("asoulNotifier.showLog", () => output.show()),
    vscode.commands.registerCommand("asoulNotifier.showBreakReminder", () => breakReminder.preview()),
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.uri.toString() === members.uri.toString()) {
        void monitor.check(true);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (
        event.affectsConfiguration("asoulNotifier.enabled")
        || event.affectsConfiguration("asoulNotifier.pollIntervalMinutes")
      ) {
        monitor.reschedule();
      }
      if (event.affectsConfiguration("asoulNotifier.breakReminder")) {
        breakReminder.reset();
      }
    })
  );

  output.appendLine(`成员配置：${members.uri.fsPath}`);
  output.appendLine(`保存 ${MEMBER_FILE_NAME} 后会立即重新检查。`);
  monitor.start();
}

export function deactivate(): void {}
