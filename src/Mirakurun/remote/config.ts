/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import { isIP } from "net";
import { ConfigServer, ConfigTunersItem } from "../../../api";

export function validHost(host: string): boolean {
    return typeof host === "string" && host.length <= 253 &&
        (isIP(host) !== 0 || /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host));
}

export function validWebhook(value: string): boolean {
    if (!value) {
        return true;
    }
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "discord.com" && !url.port &&
            !url.username && !url.password && /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/.test(url.pathname);
    } catch (_) {
        return false;
    }
}

export function validateRemoteConfig(config: ConfigServer): void {
    for (const field of ["remoteManagementEnabled", "remoteAutoRestart"]) {
        if (config[field] !== undefined && typeof config[field] !== "boolean") {
            throw new Error(`${field} must be boolean`);
        }
    }
    const peers = config.remoteMirakuruns || [];
    if (!Array.isArray(peers) || peers.length > 32) {
        throw new Error("Remote machines must be an array with at most 32 entries");
    }
    const ids = new Set<string>();
    const endpoints = new Set<string>();
    for (const peer of peers) {
        if (!peer || !/^[a-zA-Z0-9_-]{1,64}$/.test(peer.id) || ids.has(peer.id) ||
            typeof peer.name !== "string" || !peer.name.trim() || peer.name.length > 100 ||
            !["parent", "child"].includes(peer.role) || !validHost(peer.host) ||
            (peer.port !== undefined && (!Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535))) {
            throw new Error("Invalid or duplicate remote machine registration");
        }
        const endpoint = `${peer.host.toLowerCase()}:${peer.port || 40772}`;
        if (endpoints.has(endpoint)) {
            throw new Error("Register each remote host and port only once");
        }
        ids.add(peer.id);
        endpoints.add(endpoint);
    }
    if (config.remoteDiscordWebhook !== undefined &&
        (typeof config.remoteDiscordWebhook !== "string" || !validWebhook(config.remoteDiscordWebhook))) {
        throw new Error("Invalid Discord webhook URL");
    }
}

export function publicServerConfig(config: ConfigServer): ConfigServer {
    const result = { ...config, remoteDiscordWebhookConfigured: !!config.remoteDiscordWebhook };
    delete result.remoteDiscordWebhook;
    return result;
}

export function resolveRemoteTuner(tuner: ConfigTunersItem, config: ConfigServer): ConfigTunersItem {
    if (!tuner.remoteMirakurunId) {
        return tuner;
    }
    if (tuner.remoteMirakurunHost || tuner.remoteMirakurunPort) {
        throw new Error("Use a remote machine ID or a direct host/port, not both");
    }
    const peer = (config.remoteMirakuruns || []).find(item => item.id === tuner.remoteMirakurunId);
    if (!peer || peer.role !== "child") {
        throw new Error(`Unknown child machine: ${tuner.remoteMirakurunId}`);
    }
    return { ...tuner, remoteMirakurunHost: peer.host, remoteMirakurunPort: peer.port || 40772 };
}
