import * as vscode from "vscode";

type ReminderMemberName = "嘉然" | "乃琳" | "贝拉";

interface ReminderMember {
  name: ReminderMemberName;
  emoji: string;
  message: string;
}

const MEMBERS: readonly ReminderMember[] = [
  {
    name: "嘉然",
    emoji: "🎀",
    message: "亲爱的嘉心糖，代码写久了，该休息啦～要注意劳逸结合喔。"
  },
  {
    name: "乃琳",
    emoji: "💄",
    message: "亲爱的奶淇琳，已经专注很久啦～起来活动一下，再继续双向奔赴吧。"
  },
  {
    name: "贝拉",
    emoji: "💃",
    message: "亲爱的贝极星，该休息一下啦～喝点水、多多运动，身体健康吖。"
  }
];

export class BreakReminder implements vscode.Disposable {
  private lastActivityAt: number | undefined;
  private activeMilliseconds = 0;
  private showingReminder = false;
  private readonly activitySubscription: vscode.Disposable;

  constructor(private readonly output: vscode.OutputChannel) {
    this.activitySubscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.contentChanges.length > 0 && isCodingDocument(event.document)) {
        this.recordActivity(Date.now());
      }
    });
  }

  reset(reason = "配置已更新"): void {
    this.lastActivityAt = undefined;
    this.activeMilliseconds = 0;
    this.log(`${reason}，连续编码计时已重置。`);
  }

  async preview(): Promise<void> {
    await this.showReminder(true);
  }

  dispose(): void {
    this.activitySubscription.dispose();
  }

  private recordActivity(now: number): void {
    if (!this.enabled() || this.showingReminder) {
      this.lastActivityAt = undefined;
      this.activeMilliseconds = 0;
      return;
    }

    if (this.lastActivityAt === undefined) {
      this.lastActivityAt = now;
      return;
    }

    const elapsed = now - this.lastActivityAt;
    this.lastActivityAt = now;
    if (elapsed > this.idleResetMilliseconds()) {
      this.activeMilliseconds = 0;
      this.log("检测到较长空闲，连续编码计时重新开始。");
      return;
    }

    this.activeMilliseconds += elapsed;
    if (this.activeMilliseconds >= this.intervalMilliseconds()) {
      this.activeMilliseconds = 0;
      this.lastActivityAt = undefined;
      void this.showReminder(false);
    }
  }

  private async showReminder(preview: boolean): Promise<void> {
    if (this.showingReminder) return;
    this.showingReminder = true;
    try {
      const member = randomItem(this.selectedMembers());
      const message = `${member.emoji} ${member.name}提醒你：${member.message}`;
      const style = this.configuration().get<"notification" | "modal">("popupStyle", "notification");

      if (style === "modal") {
        await vscode.window.showInformationMessage(
          `${member.name}提醒你休息`,
          { modal: true, detail: member.message },
          "知道啦"
        );
      } else {
        await vscode.window.showInformationMessage(message, "休息一下");
      }
      this.log(`${preview ? "预览" : "已触发"}休息提醒：${member.name}。`);
    } finally {
      this.showingReminder = false;
    }
  }

  private selectedMembers(): ReminderMember[] {
    const configured = this.configuration().get<string[]>("members", ["嘉然", "乃琳", "贝拉"]);
    const selected = MEMBERS.filter(member => configured.includes(member.name));
    return selected.length > 0 ? selected : [...MEMBERS];
  }

  private enabled(): boolean {
    return this.configuration().get("enabled", true);
  }

  private intervalMilliseconds(): number {
    const minutes = clamp(this.configuration().get("intervalMinutes", 60), 1, 480);
    return minutes * 60_000;
  }

  private idleResetMilliseconds(): number {
    const minutes = clamp(this.configuration().get("idleResetMinutes", 5), 1, 60);
    return minutes * 60_000;
  }

  private configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("asoulNotifier.breakReminder");
  }

  private log(message: string): void {
    this.output.appendLine(`[${new Date().toLocaleString()}] ${message}`);
  }
}

function isCodingDocument(document: vscode.TextDocument): boolean {
  return !document.isClosed
    && !["output", "log", "search-result"].includes(document.languageId)
    && ["file", "untitled", "vscode-notebook-cell"].includes(document.uri.scheme);
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function clamp(value: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(numeric) ? numeric : minimum));
}
