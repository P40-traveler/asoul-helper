import * as vscode from "vscode";
import { fetchDynamics, fetchLiveStatuses } from "./bilibili";
import { MemberStore } from "./members";
import type { Member, PollResult } from "./types";

const DYNAMIC_STATE_PREFIX = "dynamicIds:";
const LIVE_STATE_PREFIX = "liveStatus:";
const MAX_DYNAMIC_IDS = 30;

interface DynamicState {
  ids: string[];
  newestPublishedAt?: number;
}

export class Monitor implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private checking = false;
  private disposed = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly members: MemberStore,
    private readonly output: vscode.OutputChannel
  ) {}

  start(): void {
    this.reschedule();
    if (this.enabled()) {
      void this.check(false);
    }
  }

  reschedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.disposed || !this.enabled()) {
      this.log("监控已暂停。", false);
      return;
    }

    const minutes = this.intervalMinutes();
    this.timer = setInterval(() => void this.check(false), minutes * 60_000);
    this.log(`监控已启动，轮询间隔 ${minutes} 分钟。`, false);
  }

  async check(manual: boolean): Promise<PollResult | undefined> {
    if (this.checking) {
      if (manual) {
        void vscode.window.showInformationMessage("A-SOUL 提醒正在检查，请稍候。", "查看日志")
          .then(choice => choice === "查看日志" && this.output.show());
      }
      return undefined;
    }

    this.checking = true;
    try {
      const members = await this.members.load();
      this.log(`开始检查 ${members.length} 个用户。`, false);

      const dynamicMembers = members.filter(member => member.dynamic !== false);
      let dynamicsChecked = 0;
      for (const member of dynamicMembers) {
        try {
          await this.checkMemberDynamics(member);
          dynamicsChecked += 1;
        } catch (error) {
          this.log(`${displayName(member)} 动态检查失败：${errorMessage(error)}`);
        }
      }

      const liveMembers = members.filter(member => member.live !== false);
      await this.checkLiveStatuses(liveMembers);
      const result = { dynamicsChecked, liveUsersChecked: liveMembers.length };
      this.log(`检查完成：动态 ${result.dynamicsChecked} 人，直播 ${result.liveUsersChecked} 人。`, false);

      if (manual) {
        void vscode.window.showInformationMessage(`检查完成：动态 ${result.dynamicsChecked} 人，直播 ${result.liveUsersChecked} 人。`);
      }
      return result;
    } catch (error) {
      const message = errorMessage(error);
      this.log(`检查失败：${message}`);
      if (manual) {
        const choice = await vscode.window.showErrorMessage(`A-SOUL 提醒检查失败：${message}`, "打开 member.json", "查看日志");
        if (choice === "打开 member.json") await this.members.open();
        if (choice === "查看日志") this.output.show();
      }
      return undefined;
    } finally {
      this.checking = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async checkMemberDynamics(member: Member): Promise<void> {
    const dynamics = await fetchDynamics(member);
    const key = `${DYNAMIC_STATE_PREFIX}${member.uid}`;
    const stored = this.context.globalState.get<DynamicState | string[]>(key);
    const oldIds = Array.isArray(stored) ? stored : stored?.ids;
    const previousTimestamp = Array.isArray(stored) ? undefined : stored?.newestPublishedAt;
    const currentIds = dynamics.map(item => item.id).slice(0, MAX_DYNAMIC_IDS);
    let newItems = typeof previousTimestamp === "number"
      ? dynamics.filter(item => (
        typeof item.publishedAt === "number"
        && item.publishedAt >= previousTimestamp
        && !oldIds?.includes(item.id)
      ))
      : itemsBeforeKnownMarker(dynamics, oldIds);

    // The feed can contain pinned or reordered historical entries. Keep only
    // items newer than the saved watermark, then collapse a batch into one
    // notification so returning to VS Code can never cause a notification storm.
    newItems = newItems
      .filter(item => previousTimestamp === undefined || item.publishedAt === undefined || item.publishedAt >= previousTimestamp)
      .filter(item => isRecentDynamic(item.publishedAt, this.dynamicMaxAgeMinutes()))
      .sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0));

    const latest = newItems[0];
    if (latest) {
      const message = newItems.length === 1
        ? `${latest.author}：${latest.summary}`
        : `${latest.author} 有 ${newItems.length} 条新动态，最新：${latest.summary}`;
      const choice = await vscode.window.showInformationMessage(message, "查看最新动态");
      if (choice === "查看最新动态") {
        await vscode.env.openExternal(vscode.Uri.parse(latest.url));
      }
    }

    const timestamps = dynamics
      .map(item => item.publishedAt)
      .filter((value): value is number => typeof value === "number");
    const newestPublishedAt = Math.max(previousTimestamp ?? 0, ...timestamps);
    const nextState: DynamicState = {
      ids: currentIds,
      ...(newestPublishedAt > 0 ? { newestPublishedAt } : {})
    };
    await this.context.globalState.update(key, nextState);
  }

  private async checkLiveStatuses(members: Member[]): Promise<void> {
    if (members.length === 0) return;
    try {
      const statuses = await fetchLiveStatuses(members);
      for (const status of statuses) {
        const key = `${LIVE_STATE_PREFIX}${status.uid}`;
        const previous = this.context.globalState.get<boolean>(key);
        if (status.isLive && previous !== true) {
          const choice = await vscode.window.showInformationMessage(
            `${status.name} 开播了：${status.title}`,
            "进入直播间"
          );
          if (choice === "进入直播间") {
            await vscode.env.openExternal(vscode.Uri.parse(status.url));
          }
        }
        await this.context.globalState.update(key, status.isLive);
      }
    } catch (error) {
      this.log(`直播状态检查失败：${errorMessage(error)}`);
    }
  }

  private enabled(): boolean {
    return vscode.workspace.getConfiguration("asoulNotifier").get("enabled", true);
  }

  private intervalMinutes(): number {
    const value = vscode.workspace.getConfiguration("asoulNotifier").get("pollIntervalMinutes", 2);
    return Math.max(1, Math.min(60, Number(value) || 2));
  }

  private dynamicMaxAgeMinutes(): number {
    const value = vscode.workspace.getConfiguration("asoulNotifier").get("dynamicMaxAgeMinutes", 30);
    return Math.max(1, Math.min(1440, Number(value) || 30));
  }

  private log(message: string, error = true): void {
    const line = `[${new Date().toLocaleString()}] ${message}`;
    error ? this.output.appendLine(`ERROR ${line}`) : this.output.appendLine(line);
  }
}

function displayName(member: Member): string {
  return member.name || `UID ${member.uid}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function itemsBeforeKnownMarker<T extends { id: string }>(items: T[], oldIds: string[] | undefined): T[] {
  if (!oldIds || oldIds.length === 0) return [];
  const markerIndex = items.findIndex(item => oldIds.includes(item.id));

  // If the saved marker has fallen out of the feed, resynchronize silently.
  // Treating the full page as new is what caused historical notification floods.
  return markerIndex < 0 ? [] : items.slice(0, markerIndex);
}

function isRecentDynamic(publishedAt: number | undefined, maxAgeMinutes: number): boolean {
  // Missing or invalid timestamps are suppressed rather than risking an old
  // notification. Bilibili's pub_ts value is expressed in Unix seconds.
  if (typeof publishedAt !== "number" || !Number.isFinite(publishedAt) || publishedAt <= 0) {
    return false;
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - publishedAt;
  return ageSeconds >= -300 && ageSeconds < maxAgeMinutes * 60;
}
