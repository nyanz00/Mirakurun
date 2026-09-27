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
import { useEffect, useState } from "react";
import { MenuItem } from "@blueprintjs/core";
import { SystemUpdateInfo } from "../../../api.d";
import { state } from "../modules/state";

export const UpdateMenuItem: React.FC = () => {
    const [info, setInfo] = useState<SystemUpdateInfo | null>(null);

    useEffect(() => {
        let active = true;
        const refresh = async () => {
            try {
                const response = await fetch("/api/system/update", { cache: "no-store" });
                if (!response.ok) {
                    return;
                }
                const data = await response.json() as SystemUpdateInfo;
                if (active) {
                    setInfo(data);
                }
            } catch (_) {
                // Version management remains available if remote status cannot be read.
            }
        };
        void refresh();
        const timer = setInterval(() => void refresh(), 30 * 1000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    const target = info?.branch === "develop" ? info.targets.develop : info?.targets.stable;
    const hasUpdate = target?.canApply === true && target.relation === "ahead";

    return <MenuItem
        icon="git-branch"
        intent={hasUpdate ? "primary" : undefined}
        text={hasUpdate ? "更新があります" : "バージョン管理"}
        onClick={() => state.navigate("/update")}
    />;
};
