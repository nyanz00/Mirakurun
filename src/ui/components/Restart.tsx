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
import { useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter } from "@blueprintjs/core";

export const Restart: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [restarting, setRestarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const handleClose = () => {
        setError(null);
        onClose();
    };

    const handleRestart = async () => {
        setRestarting(true);
        setError(null);
        try {
            const response = await fetch("/api/restart", { method: "PUT" });
            if (!response.ok) {
                const failure = await response.json().catch(() => null) as { reason?: string } | null;
                throw new Error(failure?.reason || `再起動に失敗しました (${response.status})`);
            }
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setRestarting(false);
        }
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            title="Restart Mirakurun"
            canEscapeKeyClose
        >
            <DialogBody>
                <div>
                    Do you want to restart Mirakurun?
                </div>
                {error && <p className="bp5-text-danger" role="alert">{error}</p>}
            </DialogBody>
            <DialogFooter
                actions={
                    <>
                        <Button text="Cancel" disabled={restarting} onClick={handleClose} />
                        <Button text="Restart" intent="danger" loading={restarting} onClick={handleRestart} />
                    </>
                }
            />
        </Dialog>
    );
};
