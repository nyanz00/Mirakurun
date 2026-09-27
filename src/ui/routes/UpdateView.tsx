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
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alignment, Breadcrumbs, Button, Callout, Card, Checkbox, Elevation, H3, H5, Navbar, Spinner, Tag } from "@blueprintjs/core";
import { Error as ApiError, SystemUpdateInfo, SystemUpdateJob, SystemUpdateTargetName } from "../../../api.d";
import { forkVersion } from "../modules/constants";
import * as ui from "../modules/ui";

import "./UpdateView.sass";

const relationLabel: Record<string, string> = {
    ahead: "新しい版",
    same: "現在の版",
    behind: "過去の版",
    diverged: "別の履歴",
    unknown: "比較不可"
};

export const UpdateView: React.FC = () => {
    ui.setTitle("バージョン管理");
    const [info, setInfo] = useState<SystemUpdateInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [preserveChanges, setPreserveChanges] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [restarting, setRestarting] = useState(false);
    const logRef = useRef<HTMLPreElement>(null);

    const refresh = useCallback(async (force = false) => {
        try {
            const response = await fetch(`/api/system/update${force ? "?refresh=true" : ""}`);
            if (!response.ok) {
                throw new Error(`更新情報を取得できませんでした (${response.status})`);
            }
            const data = await response.json() as SystemUpdateInfo;
            setInfo(data);
            setError(null);
            if (restarting && data.job?.restartRequired === false) {
                window.location.reload();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [restarting]);

    useEffect(() => {
        void refresh(true);
    }, []);

    useEffect(() => {
        const interval = info?.job?.status === "running" || restarting ? 2000 : 30000;
        const timer = setInterval(() => void refresh(), interval);
        return () => clearInterval(timer);
    }, [info?.job?.status, restarting, refresh]);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [info?.job?.logs.length]);

    const request = async (url: string, body?: object): Promise<SystemUpdateJob | null> => {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
            const failure = await response.json() as ApiError;
            throw new Error(failure.reason || `操作に失敗しました (${response.status})`);
        }
        return body ? await response.json() as SystemUpdateJob : null;
    };

    const begin = async (target: SystemUpdateTargetName) => {
        const selected = info?.targets[target];
        if (!selected?.canApply || !info?.canManage) {
            return;
        }
        const warning = target === "develop"
            ? "developは開発中のコードです。起動できなくなる場合、手動での復旧が必要になる可能性があります。\n\n"
            : target === "rollback" || (target === "stable" && info.branch === "develop")
                ? "現在より古いコードへ切り替わる場合があります。設定の互換性を確認してください。\n\n" : "";
        if (!window.confirm(`${warning}${selected.label}へ切り替えます。設定と局ロゴをバックアップしてからビルドします。続行しますか？`)) {
            return;
        }
        setBusy(true);
        try {
            const job = await request("/api/system/update", { target, preserveChanges });
            setInfo(current => current === null ? null : { ...current, job });
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const restart = async () => {
        setBusy(true);
        try {
            await request("/api/system/update/restart");
            setRestarting(true);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    const running = info?.job?.status === "running";
    const disabled = busy || running || !info?.canManage || !info?.isGitRepository || (!!info?.error) || (!info?.clean && !preserveChanges);
    const toolbar = <Navbar className="toolbar"><Navbar.Group align={Alignment.START}><Navbar.Heading>
        <Breadcrumbs items={[{ text: "バージョン管理" }]} />
    </Navbar.Heading></Navbar.Group></Navbar>;

    return <div className="route" id="route-update-view">
        {toolbar}
        <div className="content">
            <div className="update-container">
                <Card elevation={Elevation.ONE}>
                    <div className="update-header">
                        <H3>バージョン管理</H3>
                        <Button icon="refresh" text="更新先を再確認" loading={busy} onClick={() => void refresh(true)} />
                    </div>
                    {loading && <Spinner size={24} />}
                    {error && <Callout intent="danger">{error}</Callout>}
                    {info && <>
                        {!info.isGitRepository && <Callout intent="warning">Git clone環境ではないためWeb更新を利用できません。</Callout>}
                        {info.error && <Callout intent="warning">更新先の確認に失敗しました: {info.error}</Callout>}
                        {!info.canManage && <Callout intent="warning">この接続元IPからは更新・再起動を実行できません。サーバー設定の許可範囲を確認してください。</Callout>}
                        <div className="update-current">
                            <H5>現在</H5>
                            <div>{forkVersion}{info.branch === "develop" ? " +dev" : ""}</div>
                            <div className="bp5-text-muted">{info.branch || "detached HEAD"} / {info.commit?.slice(0, 8) || "不明"}</div>
                        </div>
                        {!info.clean && <Callout intent="warning">
                            未コミットの変更があります。<pre>{info.dirtyFiles.join("\n")}</pre>
                            <Checkbox checked={preserveChanges} onChange={e => setPreserveChanges(e.currentTarget.checked)}
                                label="変更をGit stashに退避して更新する" />
                        </Callout>}
                        <H5>更新先</H5>
                        <div className="update-targets">
                            {(["stable", "develop", "rollback"] as SystemUpdateTargetName[]).map(target => {
                                const choice = info.targets[target];
                                if (choice === null) {
                                    return target === "rollback" ? null : <div className="update-target" key={target}>更新先を取得できません</div>;
                                }
                                return <div className="update-target" key={target}>
                                    <div className="update-target-info">
                                        <strong>{target === "stable" ? "安定版" : target === "develop" ? "develop" : "過去の安定版"}</strong>
                                        <span>{choice.label}</span>
                                        <Tag minimal>{relationLabel[choice.relation]}</Tag>
                                    </div>
                                    <Button intent={target === "develop" ? "warning" : "primary"}
                                        text={target === "rollback" ? "戻す" : "切り替える"}
                                        disabled={disabled || !choice.canApply}
                                        onClick={() => void begin(target)} />
                                    {!choice.canApply && choice.reason && <div className="bp5-text-muted">{choice.reason}</div>}
                                </div>;
                            })}
                        </div>
                    </>}
                </Card>
                {info?.job && <Card elevation={Elevation.ONE}>
                    <div className="update-header"><H5>更新処理</H5><Tag intent={info.job.status === "success" ? "success" : running ? "primary" : "warning"}>{info.job.status}</Tag></div>
                    <p>{info.job.message}</p>
                    <pre className="update-logs" ref={logRef}>{info.job.logs.join("\n")}</pre>
                    {info.job.stashCommit && <Callout intent="warning">退避した変更: stash {info.job.stashCommit.slice(0, 12)}</Callout>}
                    {info.job.restartRequired && (info.canRestart
                        ? <Button intent="primary" icon="refresh" text="Mirakurunを再起動" disabled={!info.canManage || busy || restarting} onClick={() => void restart()} />
                        : <Callout intent="warning">この起動方式ではWebから再起動できません。Mirakurunを手動で再起動してください。</Callout>)}
                    {restarting && <p>再起動の完了を確認しています...</p>}
                </Card>}
            </div>
        </div>
    </div>;
};
