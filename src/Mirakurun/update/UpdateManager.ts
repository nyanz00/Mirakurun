/*
   Copyright 2026 kanreisa

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as semver from "semver";
import * as yaml from "js-yaml";
import Service from "../Service";

export type UpdateTargetName = "stable" | "develop" | "rollback";
export type UpdateRelation = "ahead" | "same" | "behind" | "diverged" | "unknown";

export interface UpdateTarget {
    label: string;
    commit: string;
    tag: string | null;
    relation: UpdateRelation;
    canApply: boolean;
    reason: string | null;
}

export interface UpdateJob {
    id: string;
    target: UpdateTargetName;
    status: "running" | "success" | "failed" | "rolled-back" | "rollback-failed";
    stage: string;
    message: string;
    logs: string[];
    restartRequired: boolean;
    startedAt: number;
    finishedAt: number | null;
    stashCommit: string | null;
}

export interface UpdateInfo {
    isGitRepository: boolean;
    branch: string | null;
    commit: string | null;
    clean: boolean;
    dirtyFiles: string[];
    targets: {
        stable: UpdateTarget | null;
        develop: UpdateTarget | null;
        rollback: UpdateTarget | null;
    };
    checkedAt: number | null;
    error: string | null;
    job: UpdateJob | null;
}

interface RemoteTargets {
    stableCommit: string;
    stableTag: string | null;
    developCommit: string;
    previousTag: string | null;
    previousCommit: string | null;
    checkedAt: number;
}

const REPOSITORY_URL = "https://github.com/nyanz00/Mirakurun.git";
const TAG_PATTERN = /^(?:\d+\.\d+\.\d+-nyanz\d+\.\d+|\d+\.\d+\.\d+-nyanz\.\d+)$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DATA_PATHSPEC = ":(exclude)data/**";
const COMMAND_TIMEOUT = 30 * 60 * 1000;
const REMOTE_CACHE_MS = 5 * 60 * 1000;
const DEPENDENCY_FILES = ["package.json", "package-lock.json", ".npmrc"];
const rootDir = path.resolve(__dirname, "../../..");
const updateDir = path.join(rootDir, "data", "update");

class UpdateManager {
    private job: UpdateJob | null = null;
    private running = false;
    private starting = false;
    private remote: RemoteTargets | null = null;
    private remoteError: string | null = null;
    private refreshPromise: Promise<void> | null = null;
    private restartScheduled = false;
    private readonly gitExecutable: string;

    constructor() {
        this.gitExecutable = this.findGit();
        this.readState();
    }

    async getInfo(force = false): Promise<UpdateInfo> {
        let branch: string | null = null;
        let commit: string | null = null;
        let dirtyFiles: string[] = [];
        let isGitRepository = false;
        let error: string | null = null;
        try {
            isGitRepository = fs.existsSync(path.join(rootDir, ".git"));
            if (isGitRepository) {
                await this.assertRepository();
                branch = (await this.git(["branch", "--show-current"])).trim() || null;
                commit = (await this.git(["rev-parse", "HEAD"])).trim();
                dirtyFiles = (await this.git(["status", "--porcelain", "--untracked-files=normal", "--", ".", DATA_PATHSPEC]))
                    .split(/\r?\n/).filter(Boolean);
                await this.refreshRemote(force);
                error = this.remoteError;
            }
        } catch (err) {
            error = this.errorText(err);
        }
        const targets: UpdateInfo["targets"] = { stable: null, develop: null, rollback: null };
        if (commit !== null && this.remote !== null) {
            targets.stable = await this.createTarget("stable", commit, branch, this.remote.stableCommit,
                this.remote.stableTag === null ? `nyanz-master (${this.remote.stableCommit.slice(0, 8)})` : `${this.remote.stableTag} (${this.remote.stableCommit.slice(0, 8)})`, this.remote.stableTag);
            targets.develop = await this.createTarget("develop", commit, branch, this.remote.developCommit,
                `develop (${this.remote.developCommit.slice(0, 8)})`, null);
            if (this.remote.previousCommit !== null && this.remote.previousTag !== null) {
                targets.rollback = await this.createTarget("rollback", commit, branch, this.remote.previousCommit,
                    this.remote.previousTag, this.remote.previousTag);
            }
        }
        return {
            isGitRepository,
            branch,
            commit,
            clean: dirtyFiles.length === 0,
            dirtyFiles,
            targets,
            checkedAt: this.remote === null ? null : this.remote.checkedAt,
            error,
            job: this.job
        };
    }

    async start(target: UpdateTargetName, preserveChanges: boolean): Promise<UpdateJob> {
        if (this.running || this.starting) {
            throw new Error("更新処理を実行中です");
        }
        if (target !== "stable" && target !== "develop" && target !== "rollback") {
            throw new Error("更新先が不正です");
        }
        this.starting = true;
        try {
            const info = await this.getInfo(true);
            const selected = info.targets[target];
            if (!info.isGitRepository || info.error !== null || selected === null || !selected.canApply) {
                throw new Error(selected?.reason || info.error || "この更新先へ切り替えられません");
            }
            if (!info.clean && !preserveChanges) {
                throw new Error("未コミットの変更があります");
            }
            const job: UpdateJob = {
                id: new Date().toISOString().replace(/[:.]/g, "-"),
                target,
                status: "running",
                stage: "checking",
                message: "更新を準備しています",
                logs: [],
                restartRequired: false,
                startedAt: Date.now(),
                finishedAt: null,
                stashCommit: null
            };
            this.job = job;
            this.running = true;
            this.writeState();
            void this.run(job, selected.commit, preserveChanges).finally(() => {
                this.running = false;
            });
            return job;
        } finally {
            this.starting = false;
        }
    }

    requestRestart(): void {
        if (this.running || this.starting || this.restartScheduled || this.job?.status !== "success" || !this.job.restartRequired) {
            throw new Error("再起動が必要な更新はありません");
        }
        if (process.platform !== "win32" || process.env.USING_WINSER !== "1") {
            throw new Error("この起動方式ではWebから再起動できません");
        }
        this.restartScheduled = true;
        setTimeout(() => process.exit(0), 500);
    }

    private async run(job: UpdateJob, requestedCommit: string, preserveChanges: boolean): Promise<void> {
        let oldCommit: string | null = null;
        let oldBranch: string | null = null;
        let switched = false;
        let installed = false;
        try {
            this.stage(job, "checking", "Gitの状態を再確認しています");
            await this.assertRepository();
            oldCommit = (await this.git(["rev-parse", "HEAD"])).trim();
            oldBranch = (await this.git(["branch", "--show-current"])).trim() || null;
            const dirty = (await this.git(["status", "--porcelain", "--untracked-files=normal", "--", ".", DATA_PATHSPEC])).trim();
            if (dirty !== "") {
                if (!preserveChanges) {
                    throw new Error("未コミットの変更があります");
                }
                this.stage(job, "stashing", "未コミットの変更を退避しています");
                await this.git(["stash", "push", "--include-untracked", "--message", `Mirakurun Web update ${job.id}`, "--", ".", DATA_PATHSPEC], job);
                job.stashCommit = (await this.git(["rev-parse", "refs/stash"])).trim();
                if (!SHA_PATTERN.test(job.stashCommit)) {
                    throw new Error("変更の退避を確認できませんでした");
                }
                this.writeState();
            }
            this.stage(job, "fetching", "nyanz版の更新先を取得しています");
            await this.refreshRemote(true);
            const info = await this.getInfo(false);
            const selected = info.targets[job.target];
            if (info.error !== null || selected === null || !selected.canApply || selected.commit !== requestedCommit) {
                throw new Error("更新先が変更されたため中止しました。画面を更新して再確認してください");
            }
            if ((await this.git(["status", "--porcelain", "--untracked-files=normal", "--", ".", DATA_PATHSPEC])).trim() !== "") {
                throw new Error("更新前の作業ツリーを整理できませんでした");
            }
            const dependencyChanged = (await this.git(["diff", "--name-only", oldCommit, selected.commit, "--", ...DEPENDENCY_FILES])).trim() !== "";
            if (dependencyChanged) {
                await this.assertWinserUnchanged(oldCommit, selected.commit);
            }
            this.stage(job, "backing-up", "設定と局ロゴをバックアップしています");
            await this.backup(job);
            this.stage(job, "switching", `${selected.label}へ切り替えています`);
            switched = true;
            if (job.target === "rollback") {
                await this.git(["checkout", "--detach", selected.commit], job);
            } else {
                await this.checkoutBranch(job.target === "develop" ? "develop" : "nyanz-master", selected.commit, job);
            }
            if (dependencyChanged) {
                this.stage(job, "installing", "npm installを実行しています");
                installed = true;
                await this.npm(["install", "--no-audit", "--no-fund"], job);
            } else {
                this.append(job, "依存関係に変更がないためnpm installを省略しました");
            }
            this.stage(job, "building", "サーバーとWeb UIをビルドしています");
            await this.npm(["run", "build"], job);
            const changedByBuild = (await this.git(["status", "--porcelain", "--untracked-files=normal", "--", ".", DATA_PATHSPEC])).trim();
            if (changedByBuild !== "") {
                throw new Error(`ビルド後に追跡ファイルが変更されました: ${changedByBuild}`);
            }
            job.status = "success";
            job.stage = "completed";
            job.message = "更新とビルドが完了しました。再起動してください";
            job.restartRequired = true;
            job.finishedAt = Date.now();
            if (job.stashCommit !== null) {
                this.append(job, `未コミットの変更はstash ${job.stashCommit.slice(0, 12)} に保持しています`);
            }
            this.writeState();
        } catch (err) {
            this.append(job, `更新に失敗しました: ${this.errorText(err)}`);
            if (switched && oldCommit !== null) {
                try {
                    this.stage(job, "rolling-back", "更新前のコードへ復旧しています");
                    await this.git(["reset", "--hard", "HEAD"], job);
                    await this.git(["checkout", "--detach", oldCommit], job);
                    if (oldBranch !== null) {
                        await this.git(["branch", "--force", oldBranch, oldCommit], job);
                        await this.git(["checkout", oldBranch], job);
                    }
                    if (installed) {
                        await this.npm(["install", "--no-audit", "--no-fund"], job);
                    }
                    await this.npm(["run", "build"], job);
                    await this.restoreStash(job);
                    job.status = "rolled-back";
                    job.message = "更新に失敗したため、更新前のコードへ復旧しました";
                } catch (rollbackError) {
                    job.status = "rollback-failed";
                    job.message = `自動復旧にも失敗しました: ${this.errorText(rollbackError)}`;
                    this.append(job, job.message);
                }
            } else {
                try {
                    await this.restoreStash(job);
                } catch (restoreError) {
                    this.append(job, `stashの復元に失敗しました: ${this.errorText(restoreError)}`);
                }
                job.status = "failed";
                job.message = this.errorText(err);
            }
            job.stage = "failed";
            job.finishedAt = Date.now();
            this.writeState();
        }
    }

    private async checkoutBranch(branch: "develop" | "nyanz-master", commit: string, job: UpdateJob): Promise<void> {
        const exists = (await this.git(["branch", "--list", "--format=%(refname)", branch])).trim() !== "";
        if (exists) {
            await this.git(["checkout", branch], job);
            await this.git(["merge", "--ff-only", commit], job);
        } else {
            await this.git(["checkout", "-b", branch, commit], job);
        }
        if ((await this.git(["rev-parse", "HEAD"])).trim() !== commit) {
            throw new Error("切り替え先のコミットが一致しません");
        }
    }

    private async restoreStash(job: UpdateJob): Promise<void> {
        if (job.stashCommit === null) {
            return;
        }
        await this.git(["stash", "apply", "--index", job.stashCommit], job);
        const stashList = await this.git(["stash", "list", "--format=%H%x09%gd"]);
        const match = stashList.split(/\r?\n/).map(line => line.split("\t"))
            .find(parts => parts[0] === job.stashCommit && /^stash@\{\d+\}$/.test(parts[1] || ""));
        if (match) {
            await this.git(["stash", "drop", match[1]], job);
        }
        this.append(job, "退避した変更を復元しました");
        job.stashCommit = null;
    }

    private async createTarget(kind: UpdateTargetName, current: string, branch: string | null, target: string,
                               label: string, tag: string | null): Promise<UpdateTarget> {
        let relation: UpdateRelation = "unknown";
        if (current === target) {
            relation = "same";
        } else if (await this.isAncestor(current, target)) {
            relation = "ahead";
        } else if (await this.isAncestor(target, current)) {
            relation = "behind";
        } else {
            relation = "diverged";
        }
        const stableHead = this.remote!.stableCommit;
        const developHead = this.remote!.developCommit;
        const onStable = await this.isAncestor(current, stableHead);
        const onDevelop = await this.isAncestor(current, developHead);
        let canApply = false;
        let reason: string | null = null;
        if (kind !== "develop" && !(await this.hasUpdater(target))) {
            reason = "この安定版にはWebアップデーターがありません";
        } else if (relation === "same") {
            reason = "既にこのコミットです";
        } else if (kind === "develop") {
            canApply = (onStable || onDevelop) && (relation === "ahead" || relation === "diverged");
            if (!canApply) {
                reason = "現在の履歴からdevelopへ安全に切り替えられません";
            }
        } else if (kind === "stable") {
            canApply = relation === "ahead" || ((branch === "develop" || onDevelop) &&
                (relation === "behind" || relation === "diverged"));
            if (!canApply) {
                reason = relation === "behind" ? "現在より古い安定版です。ロールバックを選んでください" : "安定版への切り替えを判定できません";
            }
        } else {
            canApply = (onStable || onDevelop) && (relation === "behind" || relation === "diverged");
            if (!canApply) {
                reason = "この過去版へロールバックできません";
            }
        }
        return { label, commit: target, tag, relation, canApply, reason };
    }

    private async refreshRemote(force: boolean): Promise<void> {
        if (!force && this.remote !== null && Date.now() - this.remote.checkedAt < REMOTE_CACHE_MS) {
            return;
        }
        if (this.refreshPromise !== null) {
            return this.refreshPromise;
        }
        this.refreshPromise = this.fetchRemote();
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    private async fetchRemote(): Promise<void> {
        try {
            await this.git(["fetch", "--no-write-fetch-head", "--tags", REPOSITORY_URL,
                "+refs/heads/nyanz-master:refs/remotes/mirakurun-update/nyanz-master",
                "+refs/heads/develop:refs/remotes/mirakurun-update/develop"]);
            const stableCommit = (await this.git(["rev-parse", "refs/remotes/mirakurun-update/nyanz-master"])).trim();
            const developCommit = (await this.git(["rev-parse", "refs/remotes/mirakurun-update/develop"])).trim();
            if (!SHA_PATTERN.test(stableCommit) || !SHA_PATTERN.test(developCommit)) {
                throw new Error("更新先のコミットを確認できません");
            }
            const tagNames = (await this.git(["tag", "--list"])).split(/\r?\n/)
                .filter(name => TAG_PATTERN.test(name) && semver.valid(name) !== null)
                .sort(semver.rcompare);
            const stableTags: Array<{ name: string; commit: string }> = [];
            for (const name of tagNames) {
                const commit = (await this.git(["rev-list", "-n", "1", name])).trim();
                if (SHA_PATTERN.test(commit) && await this.isAncestor(commit, stableCommit)) {
                    stableTags.push({ name, commit });
                }
            }
            const headTag = stableTags.find(item => item.commit === stableCommit);
            const rollbackTag = stableTags.find(item => item.commit !== stableCommit);
            this.remote = {
                stableCommit,
                stableTag: headTag ? headTag.name : null,
                developCommit,
                previousTag: rollbackTag ? rollbackTag.name : null,
                previousCommit: rollbackTag ? rollbackTag.commit : null,
                checkedAt: Date.now()
            };
            this.remoteError = null;
        } catch (err) {
            this.remoteError = this.errorText(err);
            if (this.remote === null) {
                throw err;
            }
        }
    }

    private async backup(job: UpdateJob): Promise<void> {
        const backupRoot = path.join(updateDir, "backups");
        const stage = path.join(backupRoot, `.creating-${job.id}`);
        const configDir = path.join(backupRoot, "config");
        const logoDir = path.join(backupRoot, "logo");
        fs.mkdirSync(stage, { recursive: true });
        let releaseLogoWrites: (() => void) | null = null;
        try {
            const configStage = path.join(stage, "config");
            fs.mkdirSync(configStage, { recursive: true });
            const configPaths = [process.env.SERVER_CONFIG_PATH, process.env.TUNERS_CONFIG_PATH, process.env.CHANNELS_CONFIG_PATH];
            for (const configPath of configPaths) {
                if (!configPath || !fs.existsSync(configPath)) {
                    throw new Error("設定ファイルが見つかりません");
                }
                const destination = path.join(configStage, path.basename(configPath));
                await this.copyValidConfig(configPath, destination);
            }
            releaseLogoWrites = await Service.pauseLogoWrites();
            const logoStage = path.join(stage, "logo");
            fs.mkdirSync(logoStage, { recursive: true });
            const logoMapPath = process.env.LOGO_MAP_PATH;
            const logoDataPath = process.env.LOGO_DATA_DIR_PATH;
            if (logoMapPath && fs.existsSync(logoMapPath)) {
                fs.copyFileSync(logoMapPath, path.join(logoStage, "logo-map.json"));
                JSON.parse(fs.readFileSync(path.join(logoStage, "logo-map.json"), "utf8"));
            }
            if (logoDataPath && fs.existsSync(logoDataPath)) {
                await fs.promises.cp(logoDataPath, path.join(logoStage, "logo-data"), { recursive: true });
            }
            releaseLogoWrites();
            releaseLogoWrites = null;
            fs.mkdirSync(configDir, { recursive: true });
            fs.renameSync(configStage, path.join(configDir, job.id));
            const oldConfigs = fs.readdirSync(configDir).sort().reverse().slice(3);
            for (const old of oldConfigs) {
                fs.rmSync(path.join(configDir, old), { recursive: true, force: true });
            }
            const oldLogoDir = path.join(stage, "previous-logo");
            if (fs.existsSync(logoDir)) {
                fs.renameSync(logoDir, oldLogoDir);
            }
            try {
                fs.renameSync(logoStage, logoDir);
            } catch (err) {
                if (fs.existsSync(oldLogoDir)) {
                    fs.renameSync(oldLogoDir, logoDir);
                }
                throw err;
            }
            this.append(job, `バックアップを作成しました: ${backupRoot}`);
        } finally {
            if (releaseLogoWrites !== null) {
                releaseLogoWrites();
            }
            fs.rmSync(stage, { recursive: true, force: true });
        }
    }

    private async copyValidConfig(source: string, destination: string): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt++) {
            const before = fs.statSync(source);
            fs.copyFileSync(source, destination);
            const after = fs.statSync(source);
            try {
                const value = yaml.load(fs.readFileSync(destination, "utf8"));
                if (value && before.size === after.size && before.mtimeMs === after.mtimeMs) {
                    return;
                }
            } catch (_) {
                // A concurrent config write may have been copied halfway through.
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`設定のバックアップを検証できません: ${path.basename(source)}`);
    }

    private async assertRepository(): Promise<void> {
        if (!fs.existsSync(path.join(rootDir, ".git"))) {
            throw new Error("Git clone環境ではありません");
        }
        const origin = (await this.git(["remote", "get-url", "origin"])).trim();
        if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)nyanz00\/Mirakurun(?:\.git)?\/?$/i.test(origin)) {
            throw new Error("originがnyanz版Mirakurunを指していません");
        }
    }

    private async assertWinserUnchanged(current: string, target: string): Promise<void> {
        if (process.platform !== "win32" || process.env.USING_WINSER !== "1") {
            return;
        }
        const readVersion = async (commit: string): Promise<string> => {
            const lock = JSON.parse(await this.git(["show", `${commit}:package-lock.json`]));
            const version = lock?.packages?.["node_modules/winser"]?.version;
            if (typeof version !== "string") {
                throw new Error("winserのバージョンを確認できません");
            }
            return version;
        };
        const [before, after] = await Promise.all([readVersion(current), readVersion(target)]);
        if (before !== after) {
            throw new Error(`winserが${before}から${after}へ変わるため、Windowsサービス上で更新できません`);
        }
    }

    private async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
        try {
            await this.git(["merge-base", "--is-ancestor", ancestor, descendant]);
            return true;
        } catch (err) {
            if ((err as any).exitCode === 1) {
                return false;
            }
            throw err;
        }
    }

    private async hasUpdater(commit: string): Promise<boolean> {
        const paths = await this.git(["ls-tree", "--name-only", commit, "--", "src/Mirakurun/update/UpdateManager.ts"]);
        return paths.trim() === "src/Mirakurun/update/UpdateManager.ts";
    }

    private git(args: string[], job?: UpdateJob): Promise<string> {
        return this.command(this.gitExecutable, ["-c", `safe.directory=${rootDir}`, ...args], job);
    }

    private npm(args: string[], job: UpdateJob): Promise<string> {
        const npmCommand = process.platform === "win32" ? this.findNpm() : "npm";
        return this.command(npmCommand, args, job);
    }

    private command(command: string, args: string[], job?: UpdateJob): Promise<string> {
        return new Promise((resolve, reject) => {
            const isCmd = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
            const executable = isCmd ? process.env.ComSpec || "cmd.exe" : command;
            const commandArgs = isCmd ? ["/d", "/s", "/c", command, ...args] : args;
            const child = spawn(executable, commandArgs, {
                cwd: rootDir,
                windowsHide: true,
                env: { ...process.env, CI: "true" }
            });
            let stdout = "";
            let stderr = "";
            let logBuffer = "";
            const collect = (data: Buffer, isError: boolean) => {
                const chunk = data.toString("utf8");
                if (isError) {
                    stderr += chunk;
                } else {
                    stdout += chunk;
                }
                if (job !== undefined) {
                    logBuffer += chunk;
                    const lines = logBuffer.split(/\r?\n/);
                    logBuffer = lines.pop() || "";
                    for (const line of lines) {
                        this.append(job, line);
                    }
                }
            };
            child.stdout.on("data", (data: Buffer) => collect(data, false));
            child.stderr.on("data", (data: Buffer) => collect(data, true));
            const timeout = setTimeout(() => child.kill(), COMMAND_TIMEOUT);
            child.on("error", err => {
                clearTimeout(timeout);
                reject(err);
            });
            child.on("close", code => {
                clearTimeout(timeout);
                if (job !== undefined && logBuffer) {
                    this.append(job, logBuffer);
                }
                if (code === 0) {
                    resolve(stdout);
                } else {
                    const error = new Error((stderr || stdout).trim().slice(-1000) || `コマンドが終了コード${code}で失敗しました`);
                    (error as any).exitCode = code;
                    reject(error);
                }
            });
        });
    }

    private findGit(): string {
        if (process.platform !== "win32") {
            return "git";
        }
        const candidates = [
            process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Git", "cmd", "git.exe") : "",
            process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Git", "cmd", "git.exe") : "",
            path.join(os.homedir(), "AppData", "Local", "Programs", "Git", "cmd", "git.exe")
        ];
        return candidates.find(candidate => candidate && fs.existsSync(candidate)) || "git.exe";
    }

    private findNpm(): string {
        const adjacent = path.join(path.dirname(process.execPath), "npm.cmd");
        return fs.existsSync(adjacent) ? adjacent : "npm.cmd";
    }

    private stage(job: UpdateJob, stage: string, message: string): void {
        job.stage = stage;
        job.message = message;
        this.append(job, message);
        this.writeState();
    }

    private append(job: UpdateJob, line: string): void {
        const clean = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").slice(0, 2000);
        if (!clean) {
            return;
        }
        job.logs.push(clean);
        if (job.logs.length > 250) {
            job.logs.splice(0, job.logs.length - 250);
        }
        fs.mkdirSync(path.join(updateDir, "jobs"), { recursive: true });
        fs.appendFileSync(path.join(updateDir, "jobs", `${job.id}.log`), `${clean}\n`);
    }

    private readState(): void {
        try {
            const state = JSON.parse(fs.readFileSync(path.join(updateDir, "state.json"), "utf8"));
            if (state.job && typeof state.job.id === "string") {
                this.job = state.job;
                if (this.job.status === "running") {
                    this.job.status = "failed";
                    this.job.stage = "failed";
                    this.job.message = "更新中にMirakurunが停止しました。作業ツリーを確認してください";
                    this.job.finishedAt = Date.now();
                } else if (this.job.status === "success") {
                    this.job.restartRequired = false;
                }
            }
        } catch (_) {
            // No previous update state exists.
        }
    }

    private writeState(): void {
        fs.mkdirSync(updateDir, { recursive: true });
        const temporary = path.join(updateDir, "state.tmp");
        fs.writeFileSync(temporary, JSON.stringify({ job: this.job }));
        fs.renameSync(temporary, path.join(updateDir, "state.json"));
    }

    private errorText(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}

export default new UpdateManager();
