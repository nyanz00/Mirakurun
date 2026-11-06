/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import * as http from "http";
import * as https from "https";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { execFile } from "child_process";

export function normalizeIP(value: string): string {
    return (value || "").replace(/^::ffff:/, "").toLowerCase();
}

export async function hostAddresses(host: string): Promise<string[]> {
    if (isIP(host)) {
        return [normalizeIP(host)];
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("DNS lookup timed out")), 4000);
        lookup(host, { all: true }).then(
            addresses => { clearTimeout(timer); resolve(addresses.map(item => normalizeIP(item.address))); },
            error => { clearTimeout(timer); reject(error); }
        );
    });
}

export function requestJSON(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<any> {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const transport = target.protocol === "https:" ? https : http;
        const data = body === undefined ? undefined : JSON.stringify(body);
        const req = transport.request(target, {
            method, agent: false, signal,
            headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}
        }, res => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", chunk => {
                size += chunk.length;
                if (size > 1024 * 1024) {
                    req.destroy(new Error("Response too large"));
                } else {
                    chunks.push(chunk);
                }
            });
            res.once("error", reject);
            res.once("aborted", () => reject(new Error("Response aborted")));
            res.once("end", () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                try {
                    resolve(size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
                } catch (_) {
                    reject(new Error("Invalid JSON response"));
                }
            });
        });
        const timer = setTimeout(() => req.destroy(new Error("API timeout (5s)")), 5000);
        req.once("close", () => clearTimeout(timer));
        req.once("error", reject);
        req.end(data);
    });
}

export async function pingHost(host: string): Promise<boolean> {
    try {
        const addresses = await hostAddresses(host);
        const address = addresses.find(item => isIP(item) === 4) || addresses[0];
        if (!address) {
            return false;
        }
        return await new Promise<boolean>(resolve => {
            const windows = process.platform === "win32";
            execFile("ping", windows ? ["-n", "1", "-w", "2000", address] : ["-c", "1", "-W", "2", address],
                { timeout: 4000, windowsHide: true }, (error, stdout) => {
                    resolve(!error && (!windows || isIP(address) !== 4 || /TTL=/i.test(stdout)));
                });
        });
    } catch (_) {
        return false;
    }
}
