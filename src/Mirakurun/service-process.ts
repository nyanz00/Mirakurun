/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */

export function canRestartService(): boolean {
    return (process.platform === "win32" && process.env.USING_WINSER === "1") ||
        (process.platform === "linux" && process.env.USING_SYSTEMD === "1" && process.env.DOCKER !== "YES");
}

export function restartService(): void {
    if (!canRestartService()) {
        throw new Error("この起動方式ではWebから再起動できません");
    }
    // NSSM and the installed systemd unit both restart after a successful exit.
    process.exit(0);
}
