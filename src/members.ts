import * as vscode from "vscode";
import type { Member } from "./types";

export const MEMBER_FILE_NAME = "member.json";

const DEFAULT_MEMBERS: Member[] = [
  { uid: 672353429, name: "贝拉", dynamic: true, live: true },
  { uid: 672328094, name: "嘉然", dynamic: true, live: true },
  { uid: 672342685, name: "乃琳", dynamic: true, live: true },
  { uid: 703007996, name: "A-SOUL_Official", dynamic: true, live: true }
];

const LEGACY_DEFAULT_UIDS = [672346917, 672353429, 672328094, 672342685, 703007996];

export class MemberStore {
  readonly uri: vscode.Uri;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.uri = vscode.Uri.joinPath(context.globalStorageUri, MEMBER_FILE_NAME);
  }

  async ensureExists(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    try {
      await vscode.workspace.fs.stat(this.uri);
      await this.migrateLegacyDefault();
    } catch {
      const content = JSON.stringify(DEFAULT_MEMBERS, null, 2) + "\n";
      await vscode.workspace.fs.writeFile(this.uri, Buffer.from(content, "utf8"));
    }
  }

  async open(): Promise<void> {
    await this.ensureExists();
    const document = await vscode.workspace.openTextDocument(this.uri);
    await vscode.window.showTextDocument(document);
  }

  async load(): Promise<Member[]> {
    await this.ensureExists();
    const bytes = await vscode.workspace.fs.readFile(this.uri);
    let value: unknown;

    try {
      value = JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch (error) {
      throw new Error(`member.json 不是有效的 JSON：${errorMessage(error)}`);
    }

    if (!Array.isArray(value)) {
      throw new Error("member.json 的顶层必须是数组。");
    }

    const seen = new Set<number>();
    return value.map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(`member.json 第 ${index + 1} 项必须是对象。`);
      }

      const rawUid = item.uid ?? item.bilibiliId;
      const uid = typeof rawUid === "string" ? Number(rawUid) : rawUid;
      if (typeof uid !== "number" || !Number.isSafeInteger(uid) || uid <= 0) {
        throw new Error(`member.json 第 ${index + 1} 项缺少有效的 uid。`);
      }
      if (seen.has(uid)) {
        throw new Error(`member.json 中存在重复 uid：${uid}。`);
      }
      seen.add(uid);

      const name = typeof item.name === "string"
        ? item.name.trim()
        : typeof item.nickname === "string"
          ? item.nickname.trim()
          : undefined;

      return {
        uid,
        ...(name ? { name } : {}),
        dynamic: item.dynamic !== false,
        live: item.live !== false
      };
    });
  }

  private async migrateLegacyDefault(): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.uri);
      const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
      if (!Array.isArray(value) || value.length !== LEGACY_DEFAULT_UIDS.length) return;

      const uids = value.map(item => isRecord(item) ? Number(item.uid ?? item.bilibiliId) : NaN);
      const isUntouchedLegacyDefault = uids.every((uid, index) => uid === LEGACY_DEFAULT_UIDS[index]);
      if (!isUntouchedLegacyDefault) return;

      const content = JSON.stringify(DEFAULT_MEMBERS, null, 2) + "\n";
      await vscode.workspace.fs.writeFile(this.uri, Buffer.from(content, "utf8"));
    } catch {
      // Invalid custom files are left intact so load() can report a useful error.
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
